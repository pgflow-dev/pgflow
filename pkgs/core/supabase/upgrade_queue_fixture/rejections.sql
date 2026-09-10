-- 0.16.0 queue upgrade fixture rejection injections (#650).
-- Each section starts with "-- scenario: <name>" and holds ONLY the old-database
-- corruption for that rejection row. The runner extracts one section with awk,
-- injects it into a freshly restored old database, snapshots state, applies the
-- real migration (which must fail atomically), and diffs the snapshots.

-- scenario: invalid_names
-- Leading/trailing/double underscores and an invalid step name, with no runs.
select pgflow.create_flow('_flow');
select pgflow.create_flow('flow_');
select pgflow.create_flow('flow__name');
select pgflow.create_flow('invnames');
select pgflow.add_step('invnames', 'bad__step');

-- scenario: case_alias
-- Case-only flow definitions share the canonical queue 'orders'.
select pgflow.create_flow('orders');

-- scenario: duplicate_pair
-- Two distinct old tasks share a prospective (queue, message) pair.
select pgflow.add_step('Orders', 'audit2');
insert into pgflow.step_states (flow_slug, run_id, step_slug, status)
select 'Orders', r.run_id, 'audit2', 'created'
from pgflow.runs r where r.flow_slug = 'Orders';

insert into pgflow.step_tasks (
  flow_slug, run_id, step_slug, task_index, status, message_id, attempts_count
)
select 'Orders', r.run_id, 'audit2', 0, 'queued', t.message_id, 0
from pgflow.runs r
join pgflow.step_tasks t on t.run_id = r.run_id and t.step_slug = 'audit'
where r.flow_slug = 'Orders';

-- scenario: orphan_message
-- Unmatched active messages: one immediately visible, one non-visible
-- (vt pushed into the future; vt > now() does not exempt it).
select pgmq.send('billing', '{"orphan":"visible"}');
select pgmq.send('billing', '{"orphan":"invisible"}');
update pgmq.q_billing
set vt = now() + interval '5 minutes'
where message = '{"orphan":"invisible"}'::jsonb;

-- scenario: missing_objects
-- Queue metadata exists but physical objects are incomplete (the archive
-- table is renamed away; queue tables are extension members and cannot be
-- dropped directly); the migration must neither reconstruct nor drop anything.
alter table pgmq.a_empty_flow rename to a_empty_flow_broken;

-- scenario: ambiguous_metadata
-- Two distinct metadata spellings ('Orders' from the seed, 'ORDERS' injected)
-- addressing the same canonical queue; exact metadata must stay unchanged.
insert into pgmq.meta (queue_name, is_partitioned, is_unlogged, created_at)
values ('ORDERS', false, false, now());

-- scenario: ownership_mismatch
-- Denormalized task/run flow_slug disagreement; no snapshot is guessed.
update pgflow.step_tasks set flow_slug = 'billing'
where run_id in (select run_id from pgflow.runs where flow_slug = 'Orders')
  and step_slug = 'audit';
