begin;
select plan(10);
select pgflow_tests.reset_db();
select pgflow.track_worker_function('handshake');
create temporary table invocation as
select pgflow.reserve_worker_invocation('handshake') as id;

select is(
  pgflow.reconcile_worker_invocation('handshake', (select id from invocation)),
  'pending',
  'receipt validates without completing the handshake'
);
select is(
  (select invocation_status from pgflow.worker_functions where function_name = 'handshake'),
  'pending', 'receipt keeps startup pending'
);
select is(
  (select count(*) from pgflow.accept_worker_invocation('handshake', (select id from invocation),
    '69600000-0000-0000-0000-000000000001', 'test_queue', 'test')),
  1::bigint, 'readiness atomically accepts and registers a worker'
);
select ok(
  (select last_heartbeat_at > transaction_timestamp() from pgflow.workers
   where worker_id = '69600000-0000-0000-0000-000000000001'),
  'readiness uses the database wall clock, not the older transaction timestamp'
);
select is(
  (select invocation_worker_id::text from pgflow.worker_functions where function_name = 'handshake'),
  '69600000-0000-0000-0000-000000000001', 'ready state identifies the accepted worker'
);
select is(
  (select count(*) from pgflow.accept_worker_invocation('handshake', (select id from invocation),
    '69600000-0000-0000-0000-000000000001', 'test_queue', 'test')),
  1::bigint, 'lost acknowledgement can recover the same registration'
);
select is(
  (select count(*) from pgflow.accept_worker_invocation('handshake', (select id from invocation),
    '69600000-0000-0000-0000-000000000002', 'test_queue', 'test')),
  0::bigint, 'another runtime cannot accept the same invocation'
);
select is(
  pgflow.dismiss_worker_invocation('handshake', (select id from invocation), 'late failure'),
  false, 'late dismissal cannot undo readiness'
);
select is(
  pgflow.reconcile_worker_invocation('other-function', (select id from invocation)),
  'rejected', 'IDs cannot address another function'
);
select is(
  (select count(*) from pgflow.ensure_workers() where function_name = 'handshake'),
  0::bigint, 'completed handshake is not a reason to invoke a healthy worker'
);
select finish();
rollback;
