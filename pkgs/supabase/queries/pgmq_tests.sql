/*

delete from pgmq.q_pgflow;
delete from pgmq.a_pgflow;

select pgflow.run_flow('Basic', '"yolo"'::jsonb);

select
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as args_with_defaults,
    pg_get_function_result(p.oid) as return_type
from
    pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on p.pronamespace = n.oid
where
    n.nspname = 'pgmq'
and p.proname = 'send'
order by
    proname;

*/

select pgmq.send('pgflow'::text, '"yolo"'::json, 5);
