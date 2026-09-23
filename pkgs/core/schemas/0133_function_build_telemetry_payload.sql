-- Builds the anonymous daily payload. Only metric names, closed bucket
-- strings, semver versions, and count buckets ever enter the jsonb.
-- Histograms group by the emitted bucket (never by raw values), and the
-- contribution list is bounded to the receiver's limits (64 entries,
-- 2048 UTF-8 bytes) by keeping a deterministic prefix: active_db_day
-- first, then metric/bucket order. A truncated report is an undercount.
create or replace function pgflow_telemetry.build_payload(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
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
