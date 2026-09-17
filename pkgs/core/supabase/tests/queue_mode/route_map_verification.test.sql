-- Route-map verification (#651): startup compares queue mode and the
-- complete ordered route map as deployment metadata independent of shape.
-- Production mode/route mismatches return a dedicated routing mismatch;
-- supplied maps that disagree with the authoritative derivation are caller
-- errors; local mode recompiles route changes destructively.
begin;
select plan(11);

select pgflow_tests.reset_db();

-- Compile a step-mode flow first (local environment)
select pgflow.ensure_flow_compiled(
  'verifyFlow',
  '{
    "steps": [
      {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step',
  '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "b", "queueName": "verifyflow__b"}]'::jsonb
);

-- Matching shape, mode, and route map verifies
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "b", "queueName": "verifyflow__b"}]'::jsonb
    ) as result
  ),
  'verified',
  'matching shape, mode, and route map verifies'
);

-- Simulate production
select set_config('app.settings.jwt_secret', 'production-secret-not-local', true);

-- Mode mismatch fails in production with a dedicated routing mismatch
select is(
  (
    select result->>'mismatchKind'
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'flow'
    ) as result
  ),
  'routing',
  'mode mismatch reports a routing mismatch kind'
);

select ok(
  (
    select exists (
      select 1
      from jsonb_array_elements_text(result->'differences') as d
      where d like 'Queue mode differs%'
    )
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'flow'
    ) as result
  ),
  'mode mismatch identifies expected and actual mode'
);

-- Persisted route drift with matching shape and mode is detected
-- (manual database edit simulated directly)
select set_config('app.settings.jwt_secret', 'super-secret-jwt-token-with-at-least-32-characters-long', true);
update pgflow.steps set queue_name = 'verifyflow__tampered'
where flow_slug = 'verifyFlow' and step_slug = 'a';
select set_config('app.settings.jwt_secret', 'production-secret-not-local', true);

select is(
  (
    select result->>'mismatchKind'
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "b", "queueName": "verifyflow__b"}]'::jsonb
    ) as result
  ),
  'routing',
  'persisted route drift reports a routing mismatch kind'
);

select ok(
  (
    select result->>'status' = 'mismatch'
       and exists (
         select 1
         from jsonb_array_elements_text(result->'differences') as d
         where d like 'Step routes differ%'
       )
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "b", "queueName": "verifyflow__b"}]'::jsonb
    ) as result
  ),
  'route drift identifies expected and actual route'
);

-- Production mismatch never mutates the database
select is(
  (select queue_name from pgflow.steps where flow_slug = 'verifyFlow' and step_slug = 'a'),
  'verifyflow__tampered',
  'production routing mismatch does not mutate routes'
);

-- Supplied route maps are compared against the authoritative derivation
select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{"steps": [{"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__WRONG"}]'::jsonb
    )
  $$,
  'supplied route map for flow "verifyFlow" disagrees with the derived route at position 1',
  'a mismatched queue name in the supplied map is rejected'
);

select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{"steps": [{"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step',
      '[]'::jsonb
    )
  $$,
  'supplied route map for flow "verifyFlow" has 0 entries but 1 step(s) was derived',
  'a missing entry in the supplied map is rejected'
);

select throws_ok(
  $$
    select pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{"steps": [{"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "a", "queueName": "verifyflow__a"}]'::jsonb
    )
  $$,
  'supplied route map for flow "verifyFlow" has 2 entries but 1 step(s) was derived',
  'a reordered or duplicated entry in the supplied map is rejected'
);

-- Local mode recompiles shape changes destructively: old queues are
-- dropped with the old definition and the new complete set is created
select set_config('app.settings.jwt_secret', 'super-secret-jwt-token-with-at-least-32-characters-long', true);
update pgflow.steps set queue_name = 'verifyflow__a'
where flow_slug = 'verifyFlow' and step_slug = 'a';
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'verifyFlow',
      '{
        "steps": [
          {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "c", "stepType": "single", "dependencies": ["b"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb,
      'step',
      '[{"stepSlug": "a", "queueName": "verifyflow__a"}, {"stepSlug": "b", "queueName": "verifyflow__b"}, {"stepSlug": "c", "queueName": "verifyflow__c"}]'::jsonb
    ) as result
  ),
  'recompiled',
  'local mode recompiles a changed shape'
);
select is(
  (
    select count(*)
    from pgmq.list_queues()
    where queue_name in ('verifyflow__a', 'verifyflow__b', 'verifyflow__c')
  ),
  3::bigint,
  'local recompilation provisions the complete new route set'
);

select finish();
rollback;
