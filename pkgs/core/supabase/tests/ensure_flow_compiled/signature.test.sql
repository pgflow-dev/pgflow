begin;
select plan(2);

select has_function(
  'pgflow',
  'ensure_flow_compiled',
  array['text', 'jsonb'],
  'ensure_flow_compiled(text, jsonb) should exist'
);

select ok(
  to_regprocedure('pgflow.ensure_flow_compiled(text,jsonb,boolean)') is null,
  'ensure_flow_compiled(text, jsonb, boolean) should not exist'
);

select * from finish();
rollback;
