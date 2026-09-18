\set ON_ERROR_STOP on
\set QUIET on

-- Owned-route preflight (#651 review regression): a route owned by an
-- existing definition of this exact flow is reusable only when its PGMQ
-- queue is actually listed. A dropped queue must fail verification instead
-- of reporting verified while polling would fail.
begin;
select plan(2);

select pgflow_tests.reset_db();

select pgflow.ensure_flow_compiled(
  'ownedqueue',
  '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
  'step'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'ownedqueue__only'),
  1::bigint,
  'Setup: the owned route has a listed PGMQ queue'
);

-- External damage: the queue is dropped while the definition still owns the route
select pgmq.drop_queue('ownedqueue__only');

select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'ownedqueue',
      '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'queue "ownedqueue__only" owned by flow "ownedqueue" is not listed in PGMQ',
  'a verified startup rejects an owned route whose PGMQ queue is missing'
);

select * from finish();
rollback;
