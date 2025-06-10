/*
Worker Overhead Analysis:
- queue_to_start_ms: Queue wait + worker claiming + start_tasks call (enqueued → start_tasks called)
- worker_overhead_ms: pgflow worker overhead (start_tasks → complete_task, minus actual task execution)
- total_execution_ms: Total worker execution time (start_tasks called → complete_task called)
- total_end_to_end_ms: Complete task lifecycle (enqueued → complete_task called)
- total_overhead_ms: All overhead combined (e2e minus actual task execution time)
*/

\x
with run as (
select * from pgflow.runs order by started_at desc limit 1
),
task as (
  select st.* from pgflow.step_tasks st, run where st.run_id = run.run_id -- and st.step_slug = 'summary'
)
  select
  step_slug,
  message_id,
  status,
  attempts_count,
  -- output,
  round(extract(epoch from (started_at - queued_at)) * 1000, 2) as queue_to_start_ms,
  case
    when step_slug = 'website' and output is not null then
      round(extract(epoch from (completed_at - started_at)) * 1000 - (output->>'content')::integer, 2)
    when step_slug = 'summary' and output is not null then
      round(extract(epoch from (completed_at - started_at)) * 1000 - (output#>>'{}')::integer, 2)
    when step_slug = 'tags' and output is not null then
      round(extract(epoch from (completed_at - started_at)) * 1000 - (output->'keywords'->>0)::integer, 2)
    else null
  end as worker_overhead_ms,
  round(extract(epoch from (completed_at - started_at)) * 1000, 2) as total_execution_ms,
  round(extract(epoch from (completed_at - queued_at)) * 1000, 2) as total_end_to_end_ms,
  case
    when step_slug = 'website' and output is not null then
      round(extract(epoch from (completed_at - queued_at)) * 1000 - (output->>'content')::integer, 2)
    when step_slug = 'summary' and output is not null then
      round(extract(epoch from (completed_at - queued_at)) * 1000 - (output#>>'{}')::integer, 2)
    when step_slug = 'tags' and output is not null then
      round(extract(epoch from (completed_at - queued_at)) * 1000 - (output->'keywords'->>0)::integer, 2)
    else null
  end as total_overhead_ms
from task;

-- select max(completed_at) - min(started_at) from pgflow.runs;

/*

select pgflow.start_flow(
  flow_slug => 'analyze_website',
  input => '{
    "url": "https://pgflow.dev",
    "user_id": "5ebc35b8-474b-480d-a115-6b303a252475"
  }'::jsonb
)
from generate_series(1, 1000);

delete from pgmq.a_analyze_website;
delete from pgmq.q_analyze_website;
delete from pgflow.step_tasks;
delete from pgflow.step_states;
delete from pgflow.runs;

*/
