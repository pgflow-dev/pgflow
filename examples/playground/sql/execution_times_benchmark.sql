/*
pgflow Performance Benchmark - Aggregated Metrics
Analyzes performance across all completed tasks with attempts_count = 1 (no retries)

Metrics per step_slug:
- count: Number of successful executions
- avg_: Average timing in milliseconds
- min_/max_: Best/worst case timing
- p50_/p95_: Percentile analysis for distribution understanding
*/

\x
with task_metrics as (
  select
    step_slug,
    round(extract(epoch from (started_at - queued_at)) * 1000, 2) as queue_to_start_ms,
    case
      when step_slug = 'website' and output is not null
        then
          round(extract(epoch from (completed_at - started_at)) * 1000 - (output ->> 'content')::integer, 2)
      when step_slug = 'summary' and output is not null
        then
          round(extract(epoch from (completed_at - started_at)) * 1000 - (output #>> '{}')::integer, 2)
      when step_slug = 'tags' and output is not null
        then
          round(extract(epoch from (completed_at - started_at)) * 1000 - (output -> 'keywords' ->> 0)::integer, 2)
      else null
    end as worker_overhead_ms,
    round(extract(epoch from (completed_at - started_at)) * 1000, 2) as total_execution_ms,
    round(extract(epoch from (completed_at - queued_at)) * 1000, 2) as total_end_to_end_ms,
    case
      when step_slug = 'website' and output is not null
        then
          round(extract(epoch from (completed_at - queued_at)) * 1000 - (output ->> 'content')::integer, 2)
      when step_slug = 'summary' and output is not null
        then
          round(extract(epoch from (completed_at - queued_at)) * 1000 - (output #>> '{}')::integer, 2)
      when step_slug = 'tags' and output is not null
        then
          round(extract(epoch from (completed_at - queued_at)) * 1000 - (output -> 'keywords' ->> 0)::integer, 2)
      else null
    end as total_overhead_ms,
    case
      when step_slug = 'website' and output is not null then (output ->> 'content')::integer
      when step_slug = 'summary' and output is not null then (output #>> '{}')::integer
      when step_slug = 'tags' and output is not null then (output -> 'keywords' ->> 0)::integer
      else null
    end as actual_task_ms
  from pgflow.step_tasks
  where
    status = 'completed'
    and attempts_count = 1
    and output is not null
)

select
  step_slug,
  count(*) as executions,

  -- Queue to start metrics
  round(avg(queue_to_start_ms), 2) as avg_queue_to_start_ms,
  round(min(queue_to_start_ms), 2) as min_queue_to_start_ms,
  round(max(queue_to_start_ms), 2) as max_queue_to_start_ms,
  round(percentile_cont(0.5) within group (order by queue_to_start_ms)::numeric, 2) as p50_queue_to_start_ms,
  round(percentile_cont(0.95) within group (order by queue_to_start_ms)::numeric, 2) as p95_queue_to_start_ms,

  -- Worker overhead metrics
  round(avg(worker_overhead_ms), 2) as avg_worker_overhead_ms,
  round(min(worker_overhead_ms), 2) as min_worker_overhead_ms,
  round(max(worker_overhead_ms), 2) as max_worker_overhead_ms,
  round(percentile_cont(0.5) within group (order by worker_overhead_ms)::numeric, 2) as p50_worker_overhead_ms,
  round(percentile_cont(0.95) within group (order by worker_overhead_ms)::numeric, 2) as p95_worker_overhead_ms,

  -- Total overhead metrics
  round(avg(total_overhead_ms), 2) as avg_total_overhead_ms,
  round(min(total_overhead_ms), 2) as min_total_overhead_ms,
  round(max(total_overhead_ms), 2) as max_total_overhead_ms,
  round(percentile_cont(0.5) within group (order by total_overhead_ms)::numeric, 2) as p50_total_overhead_ms,
  round(percentile_cont(0.95) within group (order by total_overhead_ms)::numeric, 2) as p95_total_overhead_ms,

  -- Actual task execution metrics (for comparison)
  round(avg(actual_task_ms), 2) as avg_actual_task_ms,
  round(min(actual_task_ms), 2) as min_actual_task_ms,
  round(max(actual_task_ms), 2) as max_actual_task_ms,
  round(percentile_cont(0.5) within group (order by actual_task_ms)::numeric, 2) as p50_actual_task_ms,
  round(percentile_cont(0.95) within group (order by actual_task_ms)::numeric, 2) as p95_actual_task_ms

from task_metrics
where worker_overhead_ms is not null
group by step_slug
order by step_slug;

-- Overall system metrics across all steps
select
  'OVERALL' as metric,
  count(*) as total_executions,
  round(avg(total_overhead_ms), 2) as avg_total_overhead_ms,
  round(percentile_cont(0.5) within group (order by total_overhead_ms)::numeric, 2) as p50_total_overhead_ms,
  round(percentile_cont(0.95) within group (order by total_overhead_ms)::numeric, 2) as p95_total_overhead_ms,
  round(avg(actual_task_ms), 2) as avg_actual_task_ms,
  round(avg(total_overhead_ms::float / nullif(actual_task_ms, 0) * 100), 2) as avg_overhead_percentage
from task_metrics
where worker_overhead_ms is not null;
