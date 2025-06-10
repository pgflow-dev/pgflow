-- select attempts_count, error_message from pgflow.step_tasks where status = 'failed';

select
  count(*) filter (where status = 'completed') as completed_cnt,
  count(*) filter (where status = 'failed') as failed_cnt,
  count(*) filter (where status = 'started') as started_cnt,
  count(*) filter (where status = 'queued') as queued_cnt
from pgflow.step_tasks;
