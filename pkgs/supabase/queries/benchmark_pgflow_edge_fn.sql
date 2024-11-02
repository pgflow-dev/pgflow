SELECT pgflow.run_workflow('flow_01', '{"input": "hello world"}'::jsonb)
FROM generate_series(1, 100);

\x
select * from pgflow.step_states where status != 'completed';

