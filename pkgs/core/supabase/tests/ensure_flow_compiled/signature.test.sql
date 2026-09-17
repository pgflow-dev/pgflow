-- Function signatures owned by #647 startup compilation and #651 step
-- queues. The generated migration must explicitly DROP the old released
-- signatures: `create or replace` cannot remove them, and Atlas cannot
-- derive those drops itself (see migration-management). Source schemas are
-- the final state these assertions describe.
begin;
select plan(12);

select has_function(
  'pgflow',
  'ensure_flow_compiled',
  array['text', 'jsonb', 'text', 'jsonb'],
  'ensure_flow_compiled(text, jsonb, text, jsonb) should exist'
);

select ok(
  to_regprocedure('pgflow.ensure_flow_compiled(text,jsonb)') is null,
  'legacy released ensure_flow_compiled(text, jsonb) must be dropped by the migration'
);

select ok(
  to_regprocedure('pgflow.ensure_flow_compiled(text,jsonb,boolean)') is null,
  'ensure_flow_compiled(text, jsonb, boolean) should not exist'
);

select has_function(
  'pgflow',
  'start_tasks',
  array['text', 'bigint[]', 'uuid', 'text', 'text'],
  'start_tasks(text, bigint[], uuid, text, text) should exist'
);

select ok(
  to_regprocedure('pgflow.start_tasks(text,bigint[],uuid,text)') is null,
  'legacy released four-argument start_tasks must be dropped by the migration'
);

select has_function(
  'pgflow',
  'create_flow',
  array['text', 'integer', 'integer', 'integer'],
  'create_flow(text, integer, integer, integer) should exist'
);

select ok(
  to_regprocedure('pgflow.create_flow(text,integer,integer,integer,text)') is null,
  'create_flow stays flow-only: no step-mode queue_mode parameter exists'
);

select has_function(
  'pgflow',
  '_create_flow_from_shape',
  array['text', 'jsonb', 'text'],
  '_create_flow_from_shape(text, jsonb, text) should exist'
);

select ok(
  to_regprocedure('pgflow._create_flow_from_shape(text,jsonb)') is null,
  'legacy released _create_flow_from_shape(text, jsonb) must be dropped by the migration'
);

select ok(
  to_regprocedure('pgflow._create_flow_from_shape(text,jsonb,text,jsonb)') is null,
  'caller-supplied routes parameter was removed: routes are always derived'
);

select has_function(
  'pgflow',
  '_resolve_step_queue_name',
  array['text', 'text', 'integer'],
  '_resolve_step_queue_name(text, text, integer) should exist'
);

select has_function(
  'pgflow',
  '_derive_queue_routes',
  array['text', 'jsonb', 'text'],
  '_derive_queue_routes(text, jsonb, text) should exist'
);

select * from finish();
rollback;
