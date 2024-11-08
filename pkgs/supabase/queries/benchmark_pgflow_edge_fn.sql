delete from public.pgqueuer_statistics;
delete from public.pgqueuer;
delete from pgflow.step_states where flow_slug = 'huge-flow';
delete from pgflow.runs where flow_slug = 'huge-flow';

select pgflow.run_flow('huge-flow', '{"input": "hello world"}'::jsonb)
from generate_series(1, 1000);
