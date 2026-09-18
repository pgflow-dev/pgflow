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
select jsonb_build_object(
    'schema', 1,
    'contributions', coalesce(jsonb_agg(c order by c->>'metric', c->>'bucket'), '[]'::jsonb)
  )
  from (
    -- Adoption: was this database active during the completed day?
    select jsonb_build_object('metric', 'active_db_day', 'bucket', 'yes') as c
    where exists (
      select 1 from pgflow.runs r
      where r.started_at >= p_day
        and r.started_at < p_day + 1
    )

    union all
    -- Version distribution of workers started during the day.
    select jsonb_build_object(
      'metric', 'workers_by_version',
      'bucket', w.pgflow_version,
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.workers w
    where w.started_at >= p_day
      and w.started_at < p_day + 1
      and w.pgflow_version ~ '^\d+\.\d+\.\d+'
    group by w.pgflow_version

    union all
    -- Same-database upgrade: a version started today that no earlier row had.
    select jsonb_build_object('metric', 'version_changed', 'bucket', 'yes')
    where exists (
      select 1 from pgflow.workers w
      where w.started_at >= p_day
        and w.started_at < p_day + 1
        and w.pgflow_version is not null
        and not exists (
          select 1 from pgflow.workers prev
          where prev.started_at < p_day
            and prev.pgflow_version = w.pgflow_version
        )
    )

    union all
    -- Worker function registry (current state, not windowed).
    select jsonb_build_object(
      'metric', 'worker_functions',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.worker_functions wf

    union all
    select jsonb_build_object(
      'metric', 'worker_functions_by_mode',
      'bucket', wf.start_mode,
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.worker_functions wf
    group by wf.start_mode

    union all
    select jsonb_build_object(
      'metric', 'worker_functions_disabled',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.worker_functions wf
    where not wf.enabled

    union all
    -- Worker churn during the day.
    select jsonb_build_object(
      'metric', 'workers_started_day',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.workers w
    where w.started_at >= p_day and w.started_at < p_day + 1

    union all
    select jsonb_build_object(
      'metric', 'workers_stopped_day',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.workers w
    where w.stopped_at >= p_day and w.stopped_at < p_day + 1

    union all
    select jsonb_build_object(
      'metric', 'workers_deprecated_day',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.workers w
    where w.deprecated_at >= p_day and w.deprecated_at < p_day + 1

    union all
    -- Restart churn per function (Supabase recycles every 150-400 s).
    select jsonb_build_object(
      'metric', 'worker_starts_per_function',
      'bucket', pgflow_telemetry.bucket_count(per_function.starts),
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from (
      select w.function_name, count(*) as starts
      from pgflow.workers w
      where w.started_at >= p_day and w.started_at < p_day + 1
      group by w.function_name
    ) per_function
    group by per_function.starts

    union all
    -- Active-flow shape: steps per flow, histogram over active flows.
    select jsonb_build_object(
      'metric', 'steps_per_flow',
      'bucket', pgflow_telemetry.bucket_steps(per_flow.step_count),
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from (
      select s.flow_slug, count(*) as step_count
      from pgflow.steps s
      where s.flow_slug in (
        select distinct r.flow_slug
        from pgflow.runs r
        where r.started_at >= p_day and r.started_at < p_day + 1
      )
      group by s.flow_slug
    ) per_flow
    group by per_flow.step_count

    union all
    -- Feature booleans, scoped to steps of active flows.
    select jsonb_build_object('metric', f.metric, 'bucket', 'yes')
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
    select jsonb_build_object(
      'metric', 'queue_mode',
      'bucket', f.queue_mode,
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.flows f
    where f.flow_slug in (
      select distinct r.flow_slug from pgflow.runs r
      where r.started_at >= p_day and r.started_at < p_day + 1
    )
    group by f.queue_mode

    union all
    -- Workload: runs started during the day.
    select jsonb_build_object(
      'metric', 'runs_started_day',
      'bucket', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.runs r
    where r.started_at >= p_day and r.started_at < p_day + 1

    union all
    -- Run outcomes by terminal timestamp in window.
    select jsonb_build_object(
      'metric', 'run_outcomes',
      'bucket', o.outcome,
      'count', pgflow_telemetry.bucket_count(o.n)
    )
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
    -- Wall durations of runs that terminated during the day.
    select jsonb_build_object(
      'metric', 'run_wall_duration',
      'bucket', pgflow_telemetry.bucket_duration(d.terminal_at - d.started_at),
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from (
      select r.started_at, coalesce(r.completed_at, r.failed_at) as terminal_at
      from pgflow.runs r
      where coalesce(r.completed_at, r.failed_at) >= p_day
        and coalesce(r.completed_at, r.failed_at) < p_day + 1
    ) d
    group by d.terminal_at - d.started_at

    union all
    -- Wall durations of steps that terminated during the day.
    select jsonb_build_object(
      'metric', 'step_wall_duration',
      'bucket', pgflow_telemetry.bucket_duration(d.terminal_at - d.started_at),
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from (
      select ss.started_at, coalesce(ss.completed_at, ss.failed_at) as terminal_at
      from pgflow.step_states ss
      where ss.started_at is not null
        and coalesce(ss.completed_at, ss.failed_at) >= p_day
        and coalesce(ss.completed_at, ss.failed_at) < p_day + 1
    ) d
    group by d.terminal_at - d.started_at

    union all
    -- Task attempts for tasks queued during the day.
    select jsonb_build_object(
      'metric', 'task_attempts_day',
      'bucket', pgflow_telemetry.bucket_count(coalesce(sum(t.attempts_count), 0))
    )
    from pgflow.step_tasks t
    where t.queued_at >= p_day and t.queued_at < p_day + 1

    union all
    -- Map fan-out: initial task counts of steps started during the day.
    select jsonb_build_object(
      'metric', 'map_task_count',
      'bucket', pgflow_telemetry.bucket_steps(m.initial_tasks),
      'count', pgflow_telemetry.bucket_count(count(*))
    )
    from pgflow.step_states m
    where m.started_at >= p_day and m.started_at < p_day + 1
      and m.initial_tasks >= 2
    group by m.initial_tasks
  ) contributions
$$;
-- Create "disable" function
CREATE FUNCTION "pgflow_telemetry"."disable" () RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
  begin
    perform cron.unschedule('pgflow_telemetry_report');
  exception when others then
    null; -- job already absent
  end;
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

  perform set_config('statement_timeout', '5000', true);

  begin
    v_payload := pgflow_telemetry.build_payload(v_day);
  exception when others then
    raise warning 'pgflow telemetry: payload build failed, sending nothing';
    return 'error: build failed';
  end;

  begin
    v_request_id := net.http_post(
      url => 'https://pgflow-telemetry.workers.dev',
      body => v_payload::text,
      headers => jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds => 5000
    );
  exception when others then
    raise warning 'pgflow telemetry: http_post queueing failed';
    return 'error: queue failed';
  end;

  insert into pgflow_telemetry.sent_reports (day, payload, request_id)
  values (v_day, v_payload, v_request_id);

  delete from pgflow_telemetry.sent_reports
  where day < current_date - 90;

  return 'sent: ' || v_request_id;
end
$$;
-- Create "enable" function
CREATE FUNCTION "pgflow_telemetry"."enable" () RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $BODY$
begin
  perform pgflow_telemetry.disable();
  perform cron.schedule(
    'pgflow_telemetry_report',
    '17 3 * * *',
    $$select pgflow_telemetry.report()$$
  );
end
$BODY$;
-- Create "preview" function
CREATE FUNCTION "pgflow_telemetry"."preview" ("p_day" date DEFAULT (CURRENT_DATE - 1)) RETURNS jsonb LANGUAGE sql STABLE SET "search_path" = '' AS $$ select pgflow_telemetry.build_payload(p_day) $$;

-- Scheduled exactly once, here. Later migrations must NEVER re-schedule this
-- job: a re-schedule would silently re-enable telemetry for opted-out users.
select cron.schedule(
  'pgflow_telemetry_report',
  '17 3 * * *',
  $$select pgflow_telemetry.report()$$
);
