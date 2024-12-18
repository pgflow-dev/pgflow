/*

delete from pgmq.q_pgflow;
delete from pgmq.a_pgflow;

select pgflow.run_flow('Basic', '"yolo"'::jsonb);

select pgflow.run_flow('Wide', ('"' || i::text || '"')::jsonb)
from generate_series(1, 1) as i;

*/

-- select pgmq.send('pgflow'::text, '"yolo"'::json, 5);

-- select
--     count(*) as total,
--     count(*) filter (where status = 'pending') as pending,
--     count(*) filter (where status = 'completed') as completed,
--     count(*) filter (where status = 'failed') as failed
-- from pgflow.step_states;

select
    count(*) as total,
    count(*) filter (where status = 'queued') as queued,
    count(*) filter (where status = 'started') as started,
    count(*) filter (where status = 'completed') as completed,
    count(*) filter (where status = 'failed') as failed
from pgflow.step_tasks;



-- select pgflow.stop_monitoring();
-- select pgflow.start_monitoring();
-- select pgflow_pgmq.stop_edgefn_worker();
