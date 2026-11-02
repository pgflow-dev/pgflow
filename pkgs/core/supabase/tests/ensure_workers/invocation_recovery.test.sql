begin;
select plan(14);
select pgflow_tests.reset_db();
select pgflow.track_worker_function('recovery');
create temporary table tokens as
select pgflow.reserve_worker_invocation('recovery') as old_id, null::uuid as new_id;

select ok(pgflow.dismiss_worker_invocation('recovery', (select old_id from tokens), 'initialization failed'),
  'startup failure dismisses the current pending invocation');
select is((select invocation_error from pgflow.worker_functions where function_name = 'recovery'),
  'initialization failed', 'failure reason is observable');
select is(pgflow.reconcile_worker_invocation('recovery', (select old_id from tokens)),
  'rejected', 'failed invocation cannot authorize startup');
select is(pgflow.reserve_worker_invocation('recovery'), null::uuid,
  'dismissal preserves debounce as a retry throttle');
update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds';
update tokens set new_id = pgflow.reserve_worker_invocation('recovery');
select isnt((select new_id from tokens), (select old_id from tokens), 'retry has a new invocation ID');
select is(pgflow.dismiss_worker_invocation('recovery', (select old_id from tokens), 'late failure'),
  false, 'old dismissal cannot clear a newer pending invocation');
select is(pgflow.reconcile_worker_invocation('recovery', (select old_id from tokens)),
  'rejected', 'superseded delivery is rejected');

-- Simulate delivery loss or initialization that outlives the bounded timeout.
update pgflow.worker_functions
set invocation_expires_at = clock_timestamp() - interval '1 second',
    last_invoked_at = clock_timestamp() - interval '10 seconds';
select is(pgflow.reconcile_worker_invocation('recovery', (select new_id from tokens)),
  'rejected', 'late delivery after expiry is rejected');
select is((select count(*) from pgflow.accept_worker_invocation('recovery', (select new_id from tokens),
    '69600000-0000-0000-0000-000000000003', 'queue', 'test')),
  0::bigint, 'expiry during initialization rejects final readiness');
select ok(pgflow.reserve_worker_invocation('recovery') is not null,
  'lost delivery recovers after pending timeout without acknowledgement');
select is((select count(*) from pgflow.accept_worker_invocation('recovery', null,
    '69600000-0000-0000-0000-000000000003', 'queue', 'test')),
  0::bigint, 'NULL tokens cannot authorize new processing');

update pgflow.worker_functions set enabled = false;
select is(pgflow.reconcile_worker_invocation('recovery',
  (select invocation_id from pgflow.worker_functions where function_name = 'recovery')),
  'rejected', 'disabling a registration rejects pending deliveries');
select is(pgflow.reserve_worker_invocation('recovery'), null::uuid, 'disabled functions cannot reserve');
select pgflow.track_worker_function('process-only', 'process');
select is(pgflow.reserve_worker_invocation('process-only'), null::uuid, 'process workers stay outside HTTP scheduling');
select finish();
rollback;
