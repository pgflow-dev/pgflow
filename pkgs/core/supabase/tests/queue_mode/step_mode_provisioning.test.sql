-- Step-mode queue provisioning and preflight (#651):
-- exactly the generated step-queue set is created, no unused default queue,
-- queue creation and route persistence share one transaction, preflight
-- rejects collisions before any mutation, repeated compilation converges
-- on one definition, and direct incremental SQL can neither create step
-- mode nor extend or requeue an existing step-mode definition.
begin;
select plan(29);

select pgflow_tests.reset_db();

-- Compiling a step-mode flow creates exactly its step queues
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'communityThreadsV1',
      '{
        "steps": [
          {"slug": "classify", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "deliverSlack", "stepType": "single", "dependencies": ["classify"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step'
    ) as result
  ),
  'compiled',
  'step-mode flow compiles'
);

select is(
  (select array_agg(queue_name order by step_index) from pgflow.steps where flow_slug = 'communityThreadsV1'),
  array['communitythreadsv1__classify', 'communitythreadsv1__deliverslack'],
  'each step records its generated route ordered by step_index'
);

select is(
  (
    select count(*)
    from pgmq.list_queues()
    where queue_name in ('communitythreadsv1__classify', 'communitythreadsv1__deliverslack')
  ),
  2::bigint,
  'both step queues exist in PGMQ'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'communitythreadsv1'),
  0::bigint,
  'no unused default flow queue is created in step mode'
);

select is(
  (select queue_mode from pgflow.flows where flow_slug = 'communityThreadsV1'),
  'step',
  'queue_mode is persisted separately from the shape'
);

-- create_flow stays flow-only (#651): there is no step-mode parameter, so
-- direct incremental SQL cannot create a step-mode definition
select throws_ok(
  $$ select pgflow.create_flow('noStepMode', null, null, null, 'step') $$,
  '42883',
  'function pgflow.create_flow(unknown, unknown, unknown, unknown, unknown) does not exist',
  'create_flow has no queue_mode parameter: step mode is compile-only'
);

-- Calling create_flow again for an existing step-mode definition keeps its
-- mode and routes and never creates an unused default queue
select pgflow.create_flow('communityThreadsV1', timeout => 60);
select is(
  (select queue_mode from pgflow.flows where flow_slug = 'communityThreadsV1'),
  'step',
  'repeated create_flow never resets a step-mode definition to flow mode'
);
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'communitythreadsv1'),
  0::bigint,
  'repeated create_flow creates no unused default queue for a step-mode flow'
);
select is(
  (select queue_name from pgflow.steps where flow_slug = 'communityThreadsV1' and step_slug = 'classify'),
  'communitythreadsv1__classify',
  'repeated create_flow never resets a persisted step route'
);

-- add_step cannot extend a step-mode definition incrementally: that would
-- bypass complete-route preflight and write a route compilation never
-- provisioned
select throws_ok(
  $$ select pgflow.add_step('communityThreadsV1', 'extra') $$,
  'Flow "communityThreadsV1" uses per-step queues: steps cannot be added incrementally.',
  'add_step cannot bypass complete-route preflight on a step-mode flow'
);
select is(
  (select count(*) from pgflow.steps where flow_slug = 'communityThreadsV1'),
  2::bigint,
  'rejected add_step left no partial step behind'
);

-- A second worker for the same flow verifies and reuses the same set
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'communityThreadsV1',
      '{
        "steps": [
          {"slug": "classify", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "deliverSlack", "stepType": "single", "dependencies": ["classify"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step'
    ) as result
  ),
  'verified',
  'subsequent worker verifies the existing definition'
);

-- A missing definition never adopts an already listed queue
select pgmq.create('adoptme__alpha');
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'adoptme__alpha'),
  1::bigint,
  'precondition: queue listed without an owner'
);
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'adoptMe',
      '{"steps": [{"slug": "alpha", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'cannot create flow "adoptMe": queue "adoptme__alpha" is already listed in PGMQ and not owned by this flow',
  'preflight rejects adopting a foreign listed queue before any definition is created'
);

select is(
  (select count(*) from pgflow.flows where lower(flow_slug) = 'adoptme'),
  0::bigint,
  'failed preflight leaves no flow definition behind'
);

-- Preflight completes for every route before any queue is created: a
-- collision on a later route leaves no partial queue set behind
select pgmq.create('partialflow__second');
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'partialFlow',
      '{"steps": [{"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}, {"slug": "second", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'cannot create flow "partialFlow": queue "partialflow__second" is already listed in PGMQ and not owned by this flow',
  'a later-route collision fails the complete preflight'
);
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'partialflow__first'),
  0::bigint,
  'no queue is created before the complete preflight passes'
);
select is(
  (select count(*) from pgflow.steps where flow_slug = 'partialFlow'),
  0::bigint,
  'no step is persisted before the complete preflight passes'
);

-- A name referenced by another concrete flow is rejected. The route is
-- mutated directly: only a manual edit can put another flow's route on a
-- generated name.
select pgflow.create_flow('rogue');
select pgflow.add_step('rogue', 'r');
update pgflow.steps set queue_name = 'victim__alpha' where flow_slug = 'rogue';
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'victim',
      '{"steps": [{"slug": "alpha", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'cannot create flow "victim": queue "victim__alpha" is already used by another flow ("rogue")',
  'a name derived or referenced by another concrete flow is rejected'
);

-- Ambiguous normalized matches among listed queues are rejected
select pgmq.create('ambig__Alpha');
select pgmq.create('ambig__alpha');
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'ambig',
      '{"steps": [{"slug": "alpha", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'queue "ambig__alpha" matches multiple listed PGMQ queues ({ambig__alpha,ambig__Alpha})',
  'ambiguous normalized matches are rejected before mutation'
);

-- Step mode requires at least one step
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'emptyStepFlow',
      '{"steps": []}'::jsonb,
      'step'
    )
  $$,
  'Flow "emptyStepFlow" cannot use per-step queues: it has no steps.',
  'empty flow is rejected in step mode'
);

-- Invalid local recompilation rolls back without losing the old definition,
-- queues, or runtime data
select pgflow.ensure_flow_compiled(
  'rollbackFlow',
  '{"steps": [{"slug": "one", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
  'step'
);
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'rollbackflow__one'),
  1::bigint,
  'precondition: original queue exists'
);
-- A foreign queue occupies the name the recompiled shape would derive
select pgmq.create('rollbackflow__two');
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'rollbackFlow',
      '{"steps": [{"slug": "two", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'cannot create flow "rollbackFlow": queue "rollbackflow__two" is already listed in PGMQ and not owned by this flow',
  'invalid local recompilation fails preflight'
);
select is(
  (select queue_name from pgflow.steps where flow_slug = 'rollbackFlow'),
  'rollbackflow__one',
  'old definition survives the failed recompilation'
);
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'rollbackflow__one'),
  1::bigint,
  'old queue survives the failed recompilation'
);

-- Existing-definition regressions (#651 correction): the shared route
-- preflight also runs for an already-existing verified definition, under
-- the same normalized advisory lock. A verified startup must reject
-- cross-flow references and ambiguous listed matches, while its own one
-- exact listed queue stays allowed because the definition owns the route.
select pgflow.ensure_flow_compiled(
  'verifiedFlow',
  '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
  'step'
);
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'verifiedflow__only'),
  1::bigint,
  'precondition: the exact queue for the verified route is listed'
);

-- Cross-flow ownership damage: another flow's route is manually pointed at
-- the verified flow's queue. The verified startup is rejected even though
-- the definition itself matches.
select pgflow.create_flow('verifiedRogue');
select pgflow.add_step('verifiedRogue', 'r');
update pgflow.steps set queue_name = 'verifiedflow__only' where flow_slug = 'verifiedRogue';
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'verifiedFlow',
      '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'cannot create flow "verifiedFlow": queue "verifiedflow__only" is already used by another flow ("verifiedRogue")',
  'a verified startup rejects a cross-flow reference to its route'
);

-- Remove the rogue reference; the verified startup passes again because
-- the definition owns its one exact listed queue
update pgflow.steps set queue_name = 'verifiedrogue' where flow_slug = 'verifiedRogue';
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'verifiedFlow',
      '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    ) as result
  ),
  'verified',
  'a verified definition keeps its one exact listed queue'
);

-- Listed-queue ambiguity damage: a second case-variant spelling of the
-- verified queue is listed externally. The verified startup is rejected.
select pgmq.create('verifiedflow__Only');
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'verifiedFlow',
      '{"steps": [{"slug": "only", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step'
    )
  $$,
  'queue "verifiedflow__only" matches multiple listed PGMQ queues ({verifiedflow__only,verifiedflow__Only})',
  'a verified startup rejects an ambiguous case-insensitive listed match'
);

select finish();
rollback;
