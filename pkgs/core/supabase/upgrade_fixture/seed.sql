-- Upgrade fixture seed: stale data both consolidated-migration repairs target.
-- Runs on a database at 0.15.0 (migrations up to 20260607175525 only),
-- BEFORE the consolidated task_lifecycle_hardening migration is applied.

-- ==========================================
-- Scenario 1 (#638 repair): active tasks under a skipped step
-- Map step with input [1,2] => two tasks: one queued, one started.
-- Historical skip paths archived messages but left task rows active.
-- ==========================================
select pgflow.create_flow('fix_skip', null, null, 5);
select pgflow.add_step('fix_skip', 'a', step_type => 'map');
select pgflow.start_flow('fix_skip', '[1,2]'::jsonb);

-- Reproduce the historical skip state: step skipped, messages archived,
-- task rows left queued/started.
select pgmq.archive('fix_skip', array_agg(message_id))
from pgflow.step_tasks
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_skip');

update pgflow.step_states
set
  status = 'skipped',
  skipped_at = now(),
  skip_reason = 'fixture: historical skip path',
  remaining_tasks = null
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_skip');

update pgflow.step_tasks
set
  status = 'started',
  started_at = now(),
  attempts_count = 1
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_skip')
  and task_index = 1;

-- ==========================================
-- Scenario 2 (#645 repair): unfinished tasks under a failed run
-- Map step with input [1,2] => two tasks: one queued, one started.
-- Historical failure paths archived messages but left task rows active.
-- ==========================================
select pgflow.create_flow('fix_fail', null, null, 5);
select pgflow.add_step('fix_fail', 'a', step_type => 'map');
select pgflow.start_flow('fix_fail', '[1,2]'::jsonb);

select pgmq.archive('fix_fail', array_agg(message_id))
from pgflow.step_tasks
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_fail');

update pgflow.runs
set
  status = 'failed',
  failed_at = now()
where flow_slug = 'fix_fail';

update pgflow.step_tasks
set
  status = 'started',
  started_at = now(),
  attempts_count = 1
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_fail')
  and task_index = 1;

-- ==========================================
-- Scenario 3 (repair order): queued task under BOTH a skipped step and a
-- failed run. The skipped-step repair runs first, so the expected outcome
-- is 'skipped' — a 'cancelled' result would mean the order was reversed.
-- ==========================================
select pgflow.create_flow('fix_both', null, null, 5);
select pgflow.add_step('fix_both', 'a');
select pgflow.start_flow('fix_both', '"x"'::jsonb);

select pgmq.archive('fix_both', array_agg(message_id))
from pgflow.step_tasks
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_both');

update pgflow.step_states
set
  status = 'skipped',
  skipped_at = now(),
  skip_reason = 'fixture: historical skip path',
  remaining_tasks = null
where run_id in (select run_id from pgflow.runs where flow_slug = 'fix_both');

update pgflow.runs
set
  status = 'failed',
  failed_at = now()
where flow_slug = 'fix_both';
