begin;
select plan(6);

select pgflow_tests.reset_db();

select pgflow.create_flow('skip_map_downstream');
select pgflow.add_step(
  flow_slug => 'skip_map_downstream',
  step_slug => 'a',
  max_attempts => 0,
  when_exhausted => 'skip'
);
select pgflow.add_step(
  flow_slug => 'skip_map_downstream',
  step_slug => 'm',
  step_type => 'map',
  deps_slugs => array['a']
);
select pgflow.add_step(
  flow_slug => 'skip_map_downstream',
  step_slug => 'z',
  deps_slugs => array['m']
);

with run as (
  select *
  from pgflow.start_flow('skip_map_downstream', '{}'::jsonb)
)
select run_id into temporary run_ids from run;

select pgflow_tests.poll_and_fail('skip_map_downstream');

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'a'
  ),
  'skipped',
  'source step should be skipped after exhaustion'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'm'
  ),
  'completed',
  'taskless map should auto-complete after dependency skip'
);

select is(
  (
    select output
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'm'
  ),
  '[]'::jsonb,
  'auto-completed map should emit empty array output'
);

select is(
  (
    select remaining_deps
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'z'
  ),
  0,
  'downstream step should have all dependencies resolved'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'z'
  ),
  'started',
  'downstream step should be started after map auto-completion'
);

select is(
  (
    select status
    from pgflow.runs
    where run_id = (select run_id from run_ids)
  ),
  'started',
  'run should remain started while downstream work is in progress'
);

drop table if exists run_ids;

select finish();
rollback;
