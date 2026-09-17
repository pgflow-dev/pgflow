-- Exact step selector on start_tasks (#651): extends #650's queue-aware
-- claim. Step mode requires a non-null exact step selector matching the
-- persisted route; flow mode keeps the four-argument flow-wide claim and
-- rejects a supplied selector. Invalid selectors never mutate tasks or
-- messages.
begin;
select plan(11);

select pgflow_tests.reset_db();

-- Compile a two-step flow in step mode
select pgflow.ensure_flow_compiled(
  'sel',
  '{
    "steps": [
      {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "second", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);
select pgflow.start_flow('sel', '"x"'::jsonb);

select pgflow_tests.ensure_worker('sel__first');
select pgflow_tests.ensure_worker(
  'sel__first',
  '22222222-2222-2222-2222-222222222222'::uuid
);

-- Step mode: the exact selector claims only its flow-step pair
select is(
  (
    select count(*)
    from pgflow.start_tasks(
      flow_slug => 'sel',
      msg_ids => array[(select message_id from pgflow.step_tasks where step_slug = 'first' limit 1)],
      worker_id => '11111111-1111-1111-1111-111111111111'::uuid,
      queue_name => 'sel__first',
      step_slug => 'first'
    )
  ),
  1::bigint,
  'exact step selector claims its task'
);

select is(
  (
    select count(*) from pgflow.step_tasks
    where flow_slug = 'sel' and step_slug = 'first' and status = 'started'
  ),
  1::bigint,
  'the selected step task is started exactly once'
);

-- Step mode: omitting the selector cannot obtain flow-wide claims
do $$
begin
  begin
    perform pgflow.start_tasks(
      flow_slug => 'sel',
      msg_ids => array[(select message_id from pgflow.step_tasks where step_slug = 'second' limit 1)],
      worker_id => '22222222-2222-2222-2222-222222222222'::uuid,
      queue_name => 'sel__second'
    );
    assert false, 'expected the missing step selector to be rejected';
  exception when others then
    assert sqlerrm = 'Flow "sel" uses per-step queues: an exact step_slug is required to claim tasks.',
      'unexpected error: ' || sqlerrm;
  end;
end $$;
select ok(true, 'missing step selector is rejected in step mode');

select is(
  (select status from pgflow.step_tasks where flow_slug = 'sel' and step_slug = 'second'),
  'queued',
  'rejected claim did not mutate the task'
);

-- Wrong-case selector never becomes a valid claim
do $$
begin
  begin
    perform pgflow.start_tasks(
      flow_slug => 'sel',
      msg_ids => array[(select message_id from pgflow.step_tasks where step_slug = 'second' limit 1)],
      worker_id => '22222222-2222-2222-2222-222222222222'::uuid,
      queue_name => 'sel__second',
      step_slug => 'SECOND'
    );
    assert false, 'expected the wrong-case step selector to be rejected';
  exception when others then
    assert sqlerrm = 'Step "SECOND" does not route to queue "sel__second" in flow "sel".',
      'unexpected error: ' || sqlerrm;
  end;
end $$;
select ok(true, 'wrong-case step selector is rejected');

-- Unknown selector is rejected
do $$
begin
  begin
    perform pgflow.start_tasks(
      flow_slug => 'sel',
      msg_ids => array[1],
      worker_id => '22222222-2222-2222-2222-222222222222'::uuid,
      queue_name => 'sel__first',
      step_slug => 'nope'
    );
    assert false, 'expected the unknown step selector to be rejected';
  exception when others then
    assert sqlerrm = 'Step "nope" does not route to queue "sel__first" in flow "sel".',
      'unexpected error: ' || sqlerrm;
  end;
end $$;
select ok(true, 'unknown step selector is rejected');

-- Selector of a different step's route is rejected
do $$
begin
  begin
    perform pgflow.start_tasks(
      flow_slug => 'sel',
      msg_ids => array[1],
      worker_id => '22222222-2222-2222-2222-222222222222'::uuid,
      queue_name => 'sel__second',
      step_slug => 'first'
    );
    assert false, 'expected the wrong-route selector to be rejected';
  exception when others then
    assert sqlerrm = 'Step "first" does not route to queue "sel__second" in flow "sel".',
      'unexpected error: ' || sqlerrm;
  end;
end $$;
select ok(true, 'a selector not matching the supplied queue is rejected');

-- A rejected claim leaves the message untouched (still readable later)
select is(
  (
    select count(*)
    from pgmq.read_with_poll('sel__second', 1, 1, 1, 10)
  ),
  1::bigint,
  'the second step message is still readable after rejected claims'
);

-- Flow mode: the four-argument claim keeps working
select pgflow_tests.setup_flow('sequential');
select pgflow.start_flow('sequential', '"x"'::jsonb);
select is(
  (
    select count(*)
    from pgflow.start_tasks(
      flow_slug => 'sequential',
      msg_ids => array[(select message_id from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first' limit 1)],
      worker_id => '11111111-1111-1111-1111-111111111111'::uuid,
      queue_name => 'sequential'
    )
  ),
  1::bigint,
  'flow mode keeps the four-argument flow-wide claim'
);

-- Flow mode: a supplied step selector is rejected, not silently ignored
do $$
begin
  begin
    perform pgflow.start_tasks(
      flow_slug => 'sequential',
      msg_ids => array[(select message_id from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'second' limit 1)],
      worker_id => '22222222-2222-2222-2222-222222222222'::uuid,
      queue_name => 'sequential',
      step_slug => 'first'
    );
    assert false, 'expected the flow-mode step selector to be rejected';
  exception when others then
    assert sqlerrm = 'Flow "sequential" uses the default flow queue: a step selector is not allowed.',
      'unexpected error: ' || sqlerrm;
  end;
end $$;
select ok(true, 'flow mode rejects a supplied step selector');

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'sequential' and status = 'started'),
  1::bigint,
  'only the flow-wide claim started a task'
);

select finish();
rollback;
