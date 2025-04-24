
/*

-- cleanup
delete from pgmq.a_sequential;
delete from pgmq.q_sequential;
delete from pgflow.step_tasks;
delete from pgflow.step_states;
delete from pgflow.runs;

-- start flow
select pgflow.start_flow('sequential', i::text::jsonb) from generate_series(1, 1000) as i;

*/

select
  step_slug,
  pgflow.step_tasks.output as step_output,
  pgflow.runs.input as run_input,
  pgflow.runs.output as run_output
from pgflow.step_tasks
  left join pgflow.runs on pgflow.step_tasks.run_id = pgflow.runs.run_id
order by message_id;

