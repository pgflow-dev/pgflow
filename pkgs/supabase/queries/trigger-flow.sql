select pgflow.run_flow('flow_01', '{"input": "hello world"}'::jsonb);

with last_run as (
    select * from pgflow.runs limit 1
)
select pgflow.complete_step(last_run.id, 'root', '{"yeaboi": 23}'::jsonb)
from last_run;

-- select * from pgflow.step_states, last_run where run_id = last_run.id;

-- update pgflow.step_states ss
-- set status = 'completed', step_result = NULL
-- from last_run r
-- where ss.run_id = r.id
-- and ss.step_slug = 'left';



-- from last_run;

-- select * from pgflow.step_states, last_run where run_id = last_run.id;

-- select * from pgflow.runs;
-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'root', '{"yeaboi": 23}'::jsonb);
-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'left', '"hello"'::jsonb);
-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'right', '"ellho"'::jsonb);

-- uuid - 6ba7b810-9dad-11d1-80b4-00c04fd430c8
-- insert into runs (flow_slug, id, status, payload) values (
--     'flow_01',
--     '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
--     'created', '{"input": "hello world"}'::jsonb
-- );

-- insert into step_states (flow_slug, flow_instance_id, step_id) values
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'root'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'left'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'right'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'end');
