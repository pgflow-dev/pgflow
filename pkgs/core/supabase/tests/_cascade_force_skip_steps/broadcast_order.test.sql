-- Test: _cascade_force_skip_steps - Broadcast order respects dependency graph
-- Verifies step:skipped events are sent in topological order
begin;
select plan(2);

-- Reset database and create a chain: A -> B -> C
select pgflow_tests.reset_db();
select pgflow.create_flow('order_test');
select pgflow.add_step('order_test', 'step_a');
select pgflow.add_step('order_test', 'step_b', ARRAY['step_a']);
select pgflow.add_step('order_test', 'step_c', ARRAY['step_b']);

-- Setup capture table for reliable insertion order tracking
create temporary table skip_event_log (
  seq bigserial primary key,
  run_id uuid not null,
  step_slug text not null
);

create or replace function pg_temp.capture_skip_event()
returns trigger language plpgsql as $$
begin
  if new.payload->>'event_type' = 'step:skipped' then
    insert into skip_event_log(run_id, step_slug)
    values ((new.payload->>'run_id')::uuid, new.payload->>'step_slug');
  end if;
  return new;
end;
$$;

create trigger capture_skip_event_trigger
after insert on realtime.messages
for each row execute function pg_temp.capture_skip_event();

-- Start flow
with flow as (
  select * from pgflow.start_flow('order_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a (cascades to B and C)
select pgflow._cascade_force_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Test 1: All 3 step:skipped events should exist
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  3::bigint,
  'Should have 3 step:skipped events'
);

-- Test 2: Events should be in dependency order (A before B before C)
-- Uses trigger-based capture for reliable ordering (no timestamp tie-break issues)
select results_eq(
  $$ select step_slug
     from skip_event_log
     where run_id = (select run_id from run_ids)
     order by seq $$,
  $$ values ('step_a'), ('step_b'), ('step_c') $$,
  'Should broadcast step:skipped in dependency order (step_a before step_b before step_c)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
