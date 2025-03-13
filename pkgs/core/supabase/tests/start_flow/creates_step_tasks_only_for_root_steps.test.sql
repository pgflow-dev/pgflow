begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots');

select pgflow.start_flow('two_roots', '"hello"'::jsonb);

-- TEST: A step_task record should be created only for the root step
select is(
  (
    select
      array_agg(
        step_slug
        order by step_slug
      )
    from pgflow.step_tasks
    where flow_slug = 'two_roots'
  ),
  array['root_a', 'root_b']::text [],
  'A step_task record should be created for each root step'
);

-- TEST: Two messages should be in the queue, one per each root step
select is(
  (select count(*)::int from pgmq.q_two_roots),
  2::int,
  'Two messages should be in the queue, one per each root step'
);

-- TEST; Messages have appropriate flow slugs
select is(
  (select DISTINCT message ->> 'flow_slug' from pgmq.q_two_roots),
  'two_roots'::text,
  'Messages have appropriate flow slugs'
);

-- TEST: Messages have appropriate step slugs
select is(
  (select array_agg(message ->> 'step_slug') from pgmq.q_two_roots),
  array['root_a', 'root_b']::text [],
  'Messages have appropriate step slugs'
);

select is(
  (select array_agg(message ->> 'run_id') from pgmq.q_two_roots),
  (
    select array_agg(run_id::text) from pgflow.step_tasks
    where flow_slug = 'two_roots'
  ),
  'Messages have appropriate run_ids'
);

select finish();
rollback;
