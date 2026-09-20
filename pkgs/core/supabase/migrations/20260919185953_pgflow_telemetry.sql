-- Add new schema named "pgflow_telemetry"
CREATE SCHEMA "pgflow_telemetry";
-- Create index "idx_runs_started_at" to table: "runs"
CREATE INDEX "idx_runs_started_at" ON "pgflow"."runs" ("started_at");
-- Modify "workers" table
ALTER TABLE "pgflow"."workers" ADD COLUMN "pgflow_version" text NULL;
-- Create index "idx_workers_started_at" to table: "workers"
CREATE INDEX "idx_workers_started_at" ON "pgflow"."workers" ("started_at");
-- Create index "idx_workers_stopped_at" to table: "workers"
CREATE INDEX "idx_workers_stopped_at" ON "pgflow"."workers" ("stopped_at");
-- Create "bucket_count" function
CREATE FUNCTION "pgflow_telemetry"."bucket_count" ("p_count" bigint) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET "search_path" = '' AS $$
select case
    when p_count <= 0 then '0'
    when p_count = 1 then '1'
    when p_count <= 3 then '2-3'
    when p_count <= 7 then '4-7'
    when p_count <= 15 then '8-15'
    when p_count <= 31 then '16-31'
    when p_count <= 63 then '32-63'
    when p_count <= 127 then '64-127'
    when p_count <= 255 then '128-255'
    else '256+'
  end
$$;
-- Create "bucket_duration" function
CREATE FUNCTION "pgflow_telemetry"."bucket_duration" ("p_duration" interval) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET "search_path" = '' AS $$
select case
    when p_duration < '100 milliseconds'::interval then '<100ms'
    when p_duration < '1 second'::interval then '100-999ms'
    when p_duration < '10 seconds'::interval then '1-9.9s'
    when p_duration < '1 minute'::interval then '10-59s'
    when p_duration < '5 minutes'::interval then '1-4.9m'
    when p_duration < '30 minutes'::interval then '5-29m'
    when p_duration < '2 hours'::interval then '30m-1.9h'
    when p_duration < '1 day'::interval then '2-23h'
    when p_duration < '7 days'::interval then '1-6d'
    else '7d+'
  end
$$;
-- Create "bucket_steps" function
CREATE FUNCTION "pgflow_telemetry"."bucket_steps" ("p_steps" bigint) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET "search_path" = '' AS $$
select case
    when p_steps <= 1 then '1'
    when p_steps <= 3 then '2-3'
    when p_steps <= 7 then '4-7'
    when p_steps <= 15 then '8-15'
    when p_steps <= 31 then '16-31'
    else '32+'
  end
$$;
-- Create "build_payload" function
CREATE FUNCTION "pgflow_telemetry"."build_payload" ("p_day" date) RETURNS jsonb LANGUAGE sql STABLE SET "search_path" = '' AS $$
with raw(metric, bucket, n) as (
    -- Adoption: was this database active during the completed day?
    select 'active_db_day'::text, 'yes'::text, null::text
    where exists (
      select 1 from pgflow.runs r
      where r.started_at >= p_day
        and r.started_at < p_day + 1
    )

    union all
    -- Version distribution of workers started during the day. The filter
    -- mirrors the receiver exactly: full semver grammar, at most 32
    -- characters (apps/telemetry-worker SEMVER_RE + bucket cap), so no
    -- free text can serialize even when a prefix matches.
    select
      'workers_by_version',
      w.pgflow_version,
      pgflow_telemetry.bucket_count(count(*))
    from pgflow.workers w
    where w.started_at >= p_day
      and w.started_at < p_day + 1
      and w.pgflow_version ~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$'
      and char_length(w.pgflow_version) <= 32
    group by w.pgflow_version

    union all
    -- Same-database upgrade: a version started today that no earlier row had.
    select 'version_changed', 'yes', null::text
    where exists (
      select 1 from pgflow.workers w
      where w.started_at >= p_day
        and w.started_at < p_day + 1
        and w.pgflow_version ~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$'
        and char_length(w.pgflow_version) <= 32
        and not exists (
          select 1 from pgflow.workers prev
          where prev.started_at < p_day
            and prev.pgflow_version = w.pgflow_version
        )
    )

    union all
    -- Worker function registry (current state, not windowed).
    select
      'worker_functions',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.worker_functions wf

    union all
    select
      'worker_functions_by_mode',
      wf.start_mode,
      pgflow_telemetry.bucket_count(count(*))
    from pgflow.worker_functions wf
    group by wf.start_mode

    union all
    select
      'worker_functions_disabled',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.worker_functions wf
    where not wf.enabled

    union all
    -- Worker churn during the day.
    select
      'workers_started_day',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.workers w
    where w.started_at >= p_day and w.started_at < p_day + 1

    union all
    select
      'workers_stopped_day',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.workers w
    where w.stopped_at >= p_day and w.stopped_at < p_day + 1

    union all
    select
      'workers_deprecated_day',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.workers w
    where w.deprecated_at >= p_day and w.deprecated_at < p_day + 1

    union all
    -- Restart churn per function (Supabase recycles every 150-400 s).
    -- Grouped by the emitted bucket: functions with 2 and 3 starts land
    -- in one 2-3 entry, not two.
    select
      'worker_starts_per_function',
      pgflow_telemetry.bucket_count(per_function.starts),
      pgflow_telemetry.bucket_count(count(*))
    from (
      select w.function_name, count(*) as starts
      from pgflow.workers w
      where w.started_at >= p_day and w.started_at < p_day + 1
      group by w.function_name
    ) per_function
    group by pgflow_telemetry.bucket_count(per_function.starts)

    union all
    -- Active-flow shape: steps per flow, histogram over active flows,
    -- grouped by the emitted bucket.
    select
      'steps_per_flow',
      per_flow.step_bucket,
      pgflow_telemetry.bucket_count(count(*))
    from (
      select pgflow_telemetry.bucket_steps(s.step_count) as step_bucket
      from (
        select s2.flow_slug, count(*) as step_count
        from pgflow.steps s2
        where s2.flow_slug in (
          select distinct r.flow_slug
          from pgflow.runs r
          where r.started_at >= p_day and r.started_at < p_day + 1
        )
        group by s2.flow_slug
      ) s
    ) per_flow
    group by per_flow.step_bucket

    union all
    -- Feature booleans, scoped to steps of active flows.
    select f.metric, 'yes', null::text
    from (
      select 'uses_map' as metric, exists (
        select 1 from pgflow.steps s
        where s.step_type = 'map'
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      ) as used
      union all
      select 'uses_root_map', exists (
        select 1 from pgflow.steps s
        where s.step_type = 'map' and s.deps_count = 0
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_condition', exists (
        select 1 from pgflow.steps s
        where (s.required_input_pattern is not null or s.forbidden_input_pattern is not null)
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_graceful_failure', exists (
        select 1 from pgflow.steps s
        where s.when_exhausted <> 'fail'
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_skip_cascade', exists (
        select 1 from pgflow.steps s
        where s.when_unmet = 'skip-cascade'
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_retry_override', exists (
        select 1 from pgflow.steps s
        where s.opt_max_attempts is not null
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_timeout_override', exists (
        select 1 from pgflow.steps s
        where s.opt_timeout is not null
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
      union all
      select 'uses_start_delay', exists (
        select 1 from pgflow.steps s
        where s.opt_start_delay is not null
          and s.flow_slug in (
            select distinct r.flow_slug from pgflow.runs r
            where r.started_at >= p_day and r.started_at < p_day + 1
          )
      )
    ) f
    where f.used

    union all
    -- Queue-mode adoption among active flows.
    select
      'queue_mode',
      f.queue_mode,
      pgflow_telemetry.bucket_count(count(*))
    from pgflow.flows f
    where f.flow_slug in (
      select distinct r.flow_slug from pgflow.runs r
      where r.started_at >= p_day and r.started_at < p_day + 1
    )
    group by f.queue_mode

    union all
    -- Workload: runs started during the day.
    select
      'runs_started_day',
      pgflow_telemetry.bucket_count(count(*)),
      null::text
    from pgflow.runs r
    where r.started_at >= p_day and r.started_at < p_day + 1

    union all
    -- Run outcomes by terminal timestamp in window.
    select
      'run_outcomes',
      o.outcome,
      pgflow_telemetry.bucket_count(o.n)
    from (
      select 'completed' as outcome, count(*) as n
      from pgflow.runs r
      where r.completed_at >= p_day and r.completed_at < p_day + 1
      union all
      select 'failed', count(*)
      from pgflow.runs r
      where r.failed_at >= p_day and r.failed_at < p_day + 1
      union all
      select 'started', count(*)
      from pgflow.runs r
      where r.started_at >= p_day and r.started_at < p_day + 1
        and r.status = 'started'
    ) o

    union all
    -- Wall durations of runs that terminated during the day, grouped by
    -- the emitted duration bucket.
    select
      'run_wall_duration',
      d.duration_bucket,
      pgflow_telemetry.bucket_count(count(*))
    from (
      select pgflow_telemetry.bucket_duration(t.terminal_at - t.started_at)
        as duration_bucket
      from (
        select r.started_at, coalesce(r.completed_at, r.failed_at) as terminal_at
        from pgflow.runs r
        where coalesce(r.completed_at, r.failed_at) >= p_day
          and coalesce(r.completed_at, r.failed_at) < p_day + 1
      ) t
    ) d
    group by d.duration_bucket

    union all
    -- Wall durations of steps that terminated during the day, grouped by
    -- the emitted duration bucket.
    select
      'step_wall_duration',
      d.duration_bucket,
      pgflow_telemetry.bucket_count(count(*))
    from (
      select pgflow_telemetry.bucket_duration(t.terminal_at - t.started_at)
        as duration_bucket
      from (
        select ss.started_at, coalesce(ss.completed_at, ss.failed_at) as terminal_at
        from pgflow.step_states ss
        where ss.started_at is not null
          and coalesce(ss.completed_at, ss.failed_at) >= p_day
          and coalesce(ss.completed_at, ss.failed_at) < p_day + 1
      ) t
    ) d
    group by d.duration_bucket

    union all
    -- Task attempts for tasks queued during the day.
    select
      'task_attempts_day',
      pgflow_telemetry.bucket_count(coalesce(sum(t.attempts_count), 0)),
      null::text
    from pgflow.step_tasks t
    where t.queued_at >= p_day and t.queued_at < p_day + 1

    union all
    -- Map fan-out: initial task counts of steps started during the day,
    -- grouped by the emitted bucket.
    select
      'map_task_count',
      m.task_bucket,
      pgflow_telemetry.bucket_count(count(*))
    from (
      select pgflow_telemetry.bucket_steps(ss.initial_tasks) as task_bucket
      from pgflow.step_states ss
      where ss.started_at >= p_day and ss.started_at < p_day + 1
        and ss.initial_tasks >= 2
    ) m
    group by m.task_bucket
  ),
  ordered as (
    select
      case
        when raw.n is not null then
          jsonb_build_object('metric', raw.metric, 'bucket', raw.bucket, 'count', raw.n)
        else
          jsonb_build_object('metric', raw.metric, 'bucket', raw.bucket)
      end as contribution,
      row_number() over (
        order by raw.metric <> 'active_db_day', raw.metric, raw.bucket
      ) as rank
    from raw
  ),
  bounded as (
    -- Running size of the exact jsonb serialization: envelope bytes plus
    -- each contribution's serialized form and separator.
    select
      ordered.contribution,
      ordered.rank,
      envelope.bytes
        + sum(octet_length(ordered.contribution::text) + 2)
          over (order by ordered.rank)
        - 2 as cum_bytes
    from ordered
    cross join (
      select octet_length(
        jsonb_build_object('schema', 1, 'contributions', '[]'::jsonb)::text
      ) as bytes
    ) envelope
  )
  select jsonb_build_object(
    'schema', 1,
    'contributions', coalesce((
      select jsonb_agg(bounded.contribution order by bounded.rank)
      from bounded
      where bounded.rank <= 64
        and bounded.cum_bytes <= 2048
    ), '[]'::jsonb)
  )
$$;
-- Create "job_is_scheduled" function
CREATE FUNCTION "pgflow_telemetry"."job_is_scheduled" () RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET "search_path" = '' AS $$
declare
  v_capable boolean;
  v_job_owner text;
begin
  select
    (not c.relrowsecurity)
    or r.rolsuper
    or r.rolbypassrls
    or (
      not c.relforcerowsecurity
      and pg_catalog.pg_has_role(current_user, c.relowner, 'member')
    ),
    pg_catalog.pg_get_userbyid(c.relowner)
    into v_capable, v_job_owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  cross join pg_catalog.pg_roles r
  where n.nspname = 'cron'
    and c.relname = 'job'
    and r.rolname = current_user;

  if not coalesce(v_capable, false) then
    -- Fail closed: absence cannot be proven from a visibility-limited
    -- query, so telemetry must stay ENABLED until an operator makes the
    -- helper's owner capable. Never grant privileges here dynamically.
    raise exception using message = format(
      'pgflow telemetry: cannot prove the telemetry job absent: pgflow_telemetry.job_is_scheduled() owner %L is subject to cron.job row security; fix: ALTER FUNCTION pgflow_telemetry.job_is_scheduled() OWNER TO a superuser or BYPASSRLS role or a member of the cron.job owner %L, then rerun pgflow_telemetry.disable()',
      current_user,
      v_job_owner
    );
  end if;

  return exists (
    select 1 from cron.job j
    where j.jobname = 'pgflow_telemetry_report'
  );
end
$$;
-- Create "job_registry" table
CREATE TABLE "pgflow_telemetry"."job_registry" (
  "jobname" text NOT NULL,
  "jobid" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("jobname")
);
-- Set comment to table: "job_registry"
COMMENT ON TABLE "pgflow_telemetry"."job_registry" IS 'Record of telemetry cron jobs pgflow scheduled; reconciled by disable() while job_is_scheduled() proves existence';
-- Create "disable" function
CREATE FUNCTION "pgflow_telemetry"."disable" () RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pgflow_telemetry_report')
  );

  begin
    perform cron.unschedule('pgflow_telemetry_report');
  exception when others then
    if position('could not find valid entry for job' in sqlerrm) = 0 then
      -- Permission and other cron failures stay visible: a broken opt-out
      -- must never report success silently.
      raise;
    end if;
    -- cron.unschedule found no job for the current role. That is either a
    -- genuinely absent job (idempotent disable) or a job scheduled by
    -- another role that row security hides from unschedule. Only the
    -- privileged check separates the two.
  end;

  if pgflow_telemetry.job_is_scheduled() then
    raise exception 'pgflow telemetry: cannot disable: job pgflow_telemetry_report is still scheduled by another role and stays ENABLED; run pgflow_telemetry.disable() as the role that installed pgflow';
  end if;

  -- Absence proven (after the caller's own unschedule above, other roles
  -- can still hold the same jobname, which the check above caught):
  -- reconcile any stale registry row and finish.
  delete from pgflow_telemetry.job_registry
  where jobname = 'pgflow_telemetry_report';
end
$$;
-- Create "sent_reports" table
CREATE TABLE "pgflow_telemetry"."sent_reports" (
  "day" date NOT NULL,
  "payload" jsonb NOT NULL,
  "request_id" bigint NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("day")
);
-- Set comment to table: "sent_reports"
COMMENT ON TABLE "pgflow_telemetry"."sent_reports" IS 'Audit log of every telemetry payload sent; unique day is the dedup marker';
-- Create "report" function
CREATE FUNCTION "pgflow_telemetry"."report" () RETURNS text LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_day date := current_date - 1;
  v_payload jsonb;
  v_request_id bigint;
begin
  -- Every failure path, including the gates below, returns a status:
  -- query cancellation (SQLSTATE 57014) or any gate failure must not
  -- escape this function (regression-tested in report.test.sql).
  begin
    if not exists (
      select 1 from pgflow.runs r
      where r.started_at >= v_day and r.started_at < v_day + 1
    ) then
      return 'skipped: inactive day';
    end if;

    if exists (
      select 1 from pgflow_telemetry.sent_reports s where s.day = v_day
    ) then
      return 'skipped: already reported';
    end if;

    -- Local CLI stack (developer machines, CI on supabase start) never sends.
    if pgflow.is_local() then
      return 'skipped: local';
    end if;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: gate failed';
  end;

  begin
    v_payload := pgflow_telemetry.build_payload(v_day);
    -- build_payload enforces the receiver's limits; this guard keeps a
    -- future regression from queueing a body the receiver would reject.
    if jsonb_array_length(v_payload->'contributions') > 64
      or octet_length(v_payload::text) > 2048 then
      return 'error: build failed';
    end if;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: build failed';
  end;

  -- pg_net queues transactionally: a failure in the audit insert or the
  -- prune rolls the queued request back with everything else in this block.
  begin
    v_request_id := net.http_post(
      url => 'https://pgflow-telemetry.workers.dev',
      body => v_payload,
      headers => jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds => 5000
    );
    insert into pgflow_telemetry.sent_reports (day, payload, request_id)
    values (v_day, v_payload, v_request_id);

    delete from pgflow_telemetry.sent_reports
    where day < current_date - 90;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: send failed';
  end;

  return 'sent: ' || v_request_id;
end
$$;
-- Create "enable" function
CREATE FUNCTION "pgflow_telemetry"."enable" () RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_jobid bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pgflow_telemetry_report')
  );

  perform pgflow_telemetry.disable();
  v_jobid := cron.schedule(
    'pgflow_telemetry_report',
    '17 3 * * *',
    $cron$begin; set local statement_timeout = '5 s'; select pgflow_telemetry.report(); commit;$cron$
  );
  insert into pgflow_telemetry.job_registry (jobname, jobid)
  values ('pgflow_telemetry_report', v_jobid)
  on conflict (jobname) do update
    set jobid = excluded.jobid, created_at = now();
end
$$;
-- Create "preview" function
CREATE FUNCTION "pgflow_telemetry"."preview" ("p_day" date DEFAULT (CURRENT_DATE - 1)) RETURNS jsonb LANGUAGE sql STABLE SET "search_path" = '' AS $$ select pgflow_telemetry.build_payload(p_day) $$;

-- Scheduled exactly once, here. Later migrations must NEVER re-schedule this
-- job: a re-schedule would silently re-enable telemetry for opted-out users.
-- The command carries the 5 s statement timeout at the cron boundary because
-- PostgreSQL does not arm a statement_timeout changed inside a running
-- function (verified against 17.6; see telemetry-evidence/correction-1).
-- The schedule call registers its job id in pgflow_telemetry.job_registry:
-- cron.job row security hides the job from other roles, and disable()
-- reconciles the registry while job_is_scheduled() proves actual existence.
insert into pgflow_telemetry.job_registry (jobname, jobid)
select 'pgflow_telemetry_report', cron.schedule(
  'pgflow_telemetry_report',
  '17 3 * * *',
  $cron$begin; set local statement_timeout = '5 s'; select pgflow_telemetry.report(); commit;$cron$
);
