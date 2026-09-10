-- Generated-queue provisioning rejection coverage (#650): silent adoption,
-- malformed objects, ambiguous metadata, cross-flow references, oversized
-- generated names, and late invalid steps all fail without mutation.
begin;
select plan(13);
select pgflow_tests.reset_db();

-- ---------- External preexisting queue is a collision, not adopted ----------
select pgmq.create('occupied');
select throws_ok(
  $$select pgflow.create_flow('Occupied')$$,
  'P0001', null,
  'external preexisting queue is rejected, not adopted'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'Occupied'),
  0,
  'no flow definition is inserted on collision'
);
select is(
  (select count(*)::int from pgmq.q_occupied),
  0,
  'the external queue stays empty and intact'
);

-- ---------- Partial objects: metadata without the archive table ----------
select pgflow_tests.reset_db();
select pgmq.create('partial');
alter extension pgmq drop table pgmq.a_partial;
drop table pgmq.a_partial;
select throws_ok(
  $$select pgflow.create_flow('Partial')$$,
  'P0001', null,
  'partial objects are rejected, not repaired'
);

-- ---------- Ambiguous case-aliased metadata ----------
select pgflow_tests.reset_db();
select pgmq.create('Orders');
insert into pgmq.meta (queue_name, is_partitioned, is_unlogged)
values ('orders', false, false);
select throws_ok(
  $$select pgflow.create_flow('Orders')$$,
  'P0001', null,
  'ambiguous Orders/orders metadata is rejected'
);

-- ---------- Cross-flow route reference ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Owner');
select pgflow.add_step('Owner', 'first');
select pgflow.create_flow('Thief');
select pgflow.add_step('Thief', 'first');
update pgflow.steps set queue_name = 'owner' where flow_slug = 'Thief';
select throws_ok(
  $$select pgflow.add_step('Owner', 'another')$$,
  'P0001', null,
  'a route claimed by another flow is rejected'
);

-- ---------- 48-character generated name exceeds the queue limit ----------
select pgflow_tests.reset_db();
select throws_ok(
  $$select pgflow.create_flow(repeat('a', 48))$$,
  'P0001', null,
  'a 48-character generated queue name is rejected'
);

-- The generic 128-character slug limit still applies to step slugs
select pgflow.create_flow('longstep');
select lives_ok(
  $$select pgflow.add_step('longstep', repeat('s', 127))$$,
  'a 127-character step slug is accepted'
);

-- ---------- Late invalid step rolls the whole compile back ----------
select pgflow_tests.reset_db();
select throws_ok(
  $$select pgflow.ensure_flow_compiled('late_invalid', $json$
    {"steps": [
      {"slug": "good_step", "dependencies": []},
      {"slug": "bad__step", "dependencies": []}
    ]}$json$::jsonb, '{"version": 1}'::jsonb)$$,
  'P0001', null,
  'a late invalid step rejects the whole compile'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'late_invalid'),
  0,
  'no flow definition survives a late invalid step'
);
select is(
  (select count(*)::int from pgmq.list_queues() where queue_name = 'late_invalid'),
  0,
  'no queue is provisioned for a rejected compile'
);

-- ---------- Explicit non-canonical route in add_step is rejected ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Routed');
select throws_ok(
  $$select pgflow.add_step('Routed', 'first', queue_name => 'elsewhere')$$,
  'P0001', null,
  'an explicit different route is rejected in #650'
);
select lives_ok(
  $$select pgflow.add_step('Routed', 'first', queue_name => 'routed')$$,
  'an explicit equal canonical route is accepted'
);

select finish();
rollback;
