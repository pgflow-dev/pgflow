begin;
select plan(5);

select has_function(
  'pgflow',
  'ensure_flow_compiled',
  array['text', 'jsonb', 'jsonb'],
  'ensure_flow_compiled(text, jsonb, jsonb) should exist'
);

select ok(
  to_regprocedure('pgflow.ensure_flow_compiled(text,jsonb)') is null,
  'ensure_flow_compiled(text, jsonb) should not exist'
);

select ok(
  to_regprocedure('pgflow.ensure_flow_compiled(text,jsonb,boolean)') is null,
  'ensure_flow_compiled(text, jsonb, boolean) should not exist'
);

-- Missing/non-object/wrong-version protocol is rejected before any
-- definition mutation
select throws_ok(
  $$select pgflow.ensure_flow_compiled('proto_flow', '{"steps": []}'::jsonb, null)$$,
  'P0001', 'Queue-capable worker protocol version 1 is required',
  'null protocol is rejected'
);

select throws_ok(
  $$select pgflow.ensure_flow_compiled('proto_flow', '{"steps": []}'::jsonb, '{"version": 2}'::jsonb)$$,
  'P0001', 'Queue-capable worker protocol version 1 is required',
  'wrong protocol version is rejected'
);

select * from finish();
rollback;
