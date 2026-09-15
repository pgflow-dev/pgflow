-- Route coverage query (#651): worker coverage uses a left join with liveness
-- predicates in the join, so stopped, deprecated, and stale rows do not cover
-- a route while duplicate live workers count without duplicating the route.
begin;
select plan(2);

select pgflow_tests.reset_db();

select pgflow.ensure_flow_compiled(
  'coverageFlow',
  '{
    "steps": [
      {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "second", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);

insert into pgflow.workers (
  worker_id, queue_name, function_name, started_at, deprecated_at, stopped_at, last_heartbeat_at
)
values
  ('11111111-1111-1111-1111-111111111111', 'coverageflow__first', 'first-a', now(), null, null, now()),
  ('22222222-2222-2222-2222-222222222222', 'coverageflow__first', 'first-b', now(), null, null, now()),
  ('33333333-3333-3333-3333-333333333333', 'coverageflow__first', 'first-stopped', now(), null, now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'coverageflow__second', 'second-deprecated', now(), now(), null, now()),
  ('55555555-5555-5555-5555-555555555555', 'coverageflow__second', 'second-stale', now(), null, null, now() - interval '7 seconds');

select results_eq(
  $$
    select
      step.step_slug,
      count(worker.worker_id) as live_workers
    from pgflow.flows as flow
    join pgflow.steps as step on step.flow_slug = flow.flow_slug
    left join pgflow.workers as worker
      on worker.queue_name = step.queue_name
      and worker.stopped_at is null
      and worker.deprecated_at is null
      and worker.last_heartbeat_at > now() - interval '6 seconds'
    where flow.queue_mode = 'step'
    group by step.flow_slug, step.step_slug, step.queue_name
    order by step.step_slug
  $$,
  $$ values ('first'::text, 2::bigint), ('second'::text, 0::bigint) $$,
  'coverage counts duplicate live workers and excludes stopped, deprecated, and stale workers'
);

select results_eq(
  $$
    select step.flow_slug, step.step_slug, step.queue_name
    from pgflow.flows as flow
    join pgflow.steps as step on step.flow_slug = flow.flow_slug
    left join pgflow.workers as worker
      on worker.queue_name = step.queue_name
      and worker.stopped_at is null
      and worker.deprecated_at is null
      and worker.last_heartbeat_at > now() - interval '6 seconds'
    where flow.queue_mode = 'step'
    group by step.flow_slug, step.step_slug, step.queue_name
    having count(worker.worker_id) = 0
  $$,
  $$ values ('coverageFlow'::text, 'second'::text, 'coverageflow__second'::text) $$,
  'the fresh-heartbeat left join reports the uncovered route'
);

select finish();
rollback;
