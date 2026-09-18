-- Builds the anonymous daily payload. Only metric names, closed bucket
-- strings, semver versions, and count buckets ever enter the jsonb.
create or replace function pgflow_telemetry.build_payload(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
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
