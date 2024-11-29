\x
/*

delete from pgflow.step_executions;
delete from pgflow.step_states;
delete from pgflow.runs;

select pgflow.run_flow('NlpPipeline', $$"yo"$$::jsonb)
from generate_series(1, 100) as g (i)
limit 1;

*/

select * from pgflow.step_executions;
select * from pgflow.step_states;
