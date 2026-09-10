-- Case-only duplicate flow and step slugs must be rejected atomically by
-- declarative unique indexes, even with no runs and no SQL function precheck.
begin;
select plan(10);
select pgflow_tests.reset_db();

-- Exact spelling is preserved
select lives_ok(
  $$select pgflow.create_flow('Orders')$$,
  'create_flow accepts a camelCase flow with exact spelling'
);

select is(
  (select flow_slug from pgflow.flows where flow_slug = 'Orders'),
  'Orders',
  'flow spelling is preserved'
);

select throws_ok(
  $$select pgflow.create_flow('orders')$$,
  '23505', null, 'case-only flow alias is rejected atomically'
);

select lives_ok(
  $$select pgflow.create_flow('Orders')$$,
  'exact repeated create_flow stays idempotent'
);

select lives_ok(
  $$select pgflow.add_step('Orders', 'saveItem')$$,
  'add_step accepts a camelCase step with exact spelling'
);

select throws_ok(
  $$select pgflow.add_step('Orders', 'SaveItem')$$,
  '23505', null, 'case-only step alias is rejected atomically'
);

select lives_ok(
  $$select pgflow.add_step('Orders', 'saveItem')$$,
  'exact repeated add_step stays idempotent'
);

-- Direct inserts hit the same atomic boundary
select throws_ok(
  $$insert into pgflow.flows (flow_slug) values ('ORDERS')$$,
  '23505', null, 'direct case-alias flow insert is rejected'
);

select throws_ok(
  $$insert into pgflow.steps (flow_slug, step_slug, queue_name) values ('Orders', 'SAVEITEM', 'orders')$$,
  '23505', null, 'direct case-alias step insert is rejected'
);

-- Definitions exist without any runs
select is(
  (select count(*)::int from pgflow.flows),
  1,
  'no-run definitions remain (single flow after aliases rejected)'
);

select finish();
rollback;
