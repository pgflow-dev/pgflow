begin;
select plan(2);
select pgflow_tests.reset_db();

/*
 * We need two queued tasks that (wrongly) share the same pgmq msg_id.
 * The ordinary DSL guarantees uniqueness, so we:
 *   - create a "two-roots" flow (two independent root steps),
 *   - start a run (=> two different messages),
 *   - force the second step_task to reuse the msg_id of the first.
 * This mimics the race that sometimes happens in production.
 */
select pgflow_tests.setup_flow('two_roots');
select pgflow.start_flow('two_roots', '"input"'::jsonb);

-- Pick the msg_id of root_a and reuse it for root_b
update pgflow.step_tasks
set
  message_id = (
    select message_id
    from pgflow.step_tasks
    where step_slug = 'root_a'
    limit 1
  )
where step_slug = 'root_b';

-- 1. There are now two step_tasks with the same msg_id
select is(
  (
    select count(*)::int
    from pgflow.step_tasks
    group by message_id
    having count(*) > 1
  ),
  1,
  'We successfully created a duplicate message_id'
);

-- 2. Polling should NOT throw "more than one row returned ..."
--    and should return the two tasks.
select is(
  (
    select count(*)::int
    from pgflow.poll_for_tasks('two_roots', 1, 1)
  ),
  2,
  'poll_for_tasks handles duplicate message_id without error'
);

select * from finish();
rollback;
