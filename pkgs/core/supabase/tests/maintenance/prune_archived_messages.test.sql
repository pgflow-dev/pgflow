begin;
select plan(4);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create test flows with sequential structure to ensure message archiving
select pgflow_tests.setup_flow('sequential');

-- Start the flow and complete the first step to create an archived message
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Get the run_id for the first flow
\set run_id_1 `echo "SELECT run_id FROM pgflow.runs LIMIT 1;" | psql -t -A`

-- Complete the first task using poll_and_complete to ensure proper handling
select pgflow_tests.poll_and_complete('sequential');

-- Verify that a message was archived
select is(
  (select count(*)::INT from pgmq.a_sequential),
  1::INT,
  'One message should be archived initially'
);

-- Create a second flow and complete its first task to archive another message
select pgflow.start_flow('sequential', '{"test": "second run"}'::JSONB);
select pgflow_tests.poll_and_complete('sequential');

-- Now we have two archived messages
select is(
  (select count(*)::INT from pgmq.a_sequential),
  2::INT,
  'Two messages should be archived'
);

-- Set different timestamps for the archived messages
-- Make one message old (31 days)
update pgmq.a_sequential
set archived_at = now() - INTERVAL '31 days'
where msg_id = (select min(msg_id) from pgmq.a_sequential);

-- Leave the other message recent (5 days)
update pgmq.a_sequential
set archived_at = now() - INTERVAL '5 days'
where msg_id = (select max(msg_id) from pgmq.a_sequential);

-- Prune with 30-day retention
select pgflow.prune_data_older_than(30);

-- TEST: Only the old archived message should be pruned
select is(
  (select count(*)::INT from pgmq.a_sequential),
  1::INT,
  'Only one message should remain after pruning'
);

-- TEST: Check that the remaining message is the recent one
select is(
  (
    select (extract(day from now() - archived_at) < 10)::BOOLEAN
    from pgmq.a_sequential
  ),
  true,
  'The remaining message should be the recent one'
);

select finish();
rollback;
