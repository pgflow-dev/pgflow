-- 0.16.0 queue upgrade fixture audit assertions (#650).
-- Part 1 (sections "-- scenario:") injects every audit report category into a
-- freshly restored old database, INCLUDING more than 20 NULL-message tasks to
-- exercise the sample cap and an unrelated application queue with a
-- distinctive body token.
-- Part 2 runs AFTER the audit script and asserts the database is unchanged
-- (read-only report). The runner additionally greps the NOTICE log for exact
-- incompatible names, the 20-key sample cap, NULL counts, and that the
-- unrelated queue's body token never appears.

-- scenario: inject
select pgflow.create_flow('_bad_flow');
select pgflow.create_flow('bad_');
select pgflow.create_flow('a__b');
select pgflow.create_flow('orders');

select pgflow.create_flow('many_null');
select pgflow.add_step('many_null', 'fan', step_type => 'map');
select pgflow.start_flow('many_null', (
  select jsonb_agg(g) from generate_series(1, 25) g
));
select pgmq.archive('many_null', array_agg(message_id))
from pgflow.step_tasks where flow_slug = 'many_null';
update pgflow.step_tasks set message_id = null where flow_slug = 'many_null';

select pgmq.send('billing', '{"orphan":"visible"}');
select pgmq.send('billing', '{"orphan":"invisible"}');
update pgmq.q_billing
set vt = now() + interval '5 minutes'
where message = '{"orphan":"invisible"}'::jsonb;

-- Missing archive column on a separate queue (empty_flow): the audit must
-- report the malformed physical shape; billing keeps reporting its orphan
-- messages because the malformed report skips only empty_flow.
alter table pgmq.a_empty_flow drop column headers;

-- ==========================================
-- Post-audit: read-only proof (run after PRE_MIGRATION_CHECK_650.sql)
-- ==========================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'pgflow'
    and table_name in ('steps', 'step_tasks')
    and column_name = 'queue_name';
  if v_count <> 0 then
    raise exception 'audit added pgflow columns (was not read-only)';
  end if;

  if not exists (select 1 from pgflow.flows where flow_slug = '_bad_flow') then
    raise exception 'audit mutated definitions';
  end if;

  if not exists (
    select 1 from pgmq.q_app_events where message ->> 'secret' = 'app-token-XYZ-3f9'
  ) then
    raise exception 'audit disturbed the unrelated application queue';
  end if;
end $$;
