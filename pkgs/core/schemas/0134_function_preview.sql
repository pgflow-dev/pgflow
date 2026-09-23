-- Returns any day's payload without sending. Works on local databases too:
-- it is the debugging tool.
create or replace function pgflow_telemetry.preview(p_day date default current_date - 1)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pgflow_telemetry.build_payload(p_day)
$$;
