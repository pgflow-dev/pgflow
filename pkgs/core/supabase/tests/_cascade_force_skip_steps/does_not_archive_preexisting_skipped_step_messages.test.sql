\set ON_ERROR_STOP on
\set QUIET on

begin;
select plan(4);

select pgflow_tests.reset_db();

select pgflow.create_flow('cascade_skip_preexisting');
select pgflow.add_step('cascade_skip_preexisting', 'target', '{}', step_type => 'map');
select pgflow.add_step('cascade_skip_preexisting', 'already_skipped', '{}', step_type => 'map');

select pgflow.start_flow('cascade_skip_preexisting', '[1, 2]'::jsonb);

select ok(
  (
    select count(*) > 0
    from pgmq.q_cascade_skip_preexisting q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.flow_slug = 'cascade_skip_preexisting'
      and st.step_slug = 'already_skipped'
  ),
  'Setup: already_skipped has queued messages before cascade call'
);

update pgflow.step_states
set status = 'skipped',
    skip_reason = 'preexisting_skip',
    skipped_at = now(),
    remaining_tasks = null
where flow_slug = 'cascade_skip_preexisting'
  and step_slug = 'already_skipped';

select pgflow._cascade_force_skip_steps(
  (select run_id from pgflow.runs where flow_slug = 'cascade_skip_preexisting'),
  'target',
  'condition_unmet'
);

select is_empty(
  $$
  select 1
  from pgmq.q_cascade_skip_preexisting q
  join pgflow.step_tasks st on st.message_id = q.msg_id
  where st.flow_slug = 'cascade_skip_preexisting'
    and st.step_slug = 'target'
  $$,
  'Target step messages should be archived'
);

select isnt_empty(
  $$
  select 1
  from pgmq.q_cascade_skip_preexisting q
  join pgflow.step_tasks st on st.message_id = q.msg_id
  where st.flow_slug = 'cascade_skip_preexisting'
    and st.step_slug = 'already_skipped'
  $$,
  'Preexisting skipped step messages should remain queued'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'cascade_skip_preexisting' and step_slug = 'target'),
  'skipped'::text,
  'Target step should be marked skipped'
);

select * from finish();
rollback;
