-- Helper function to conditionally send realtime events
create or replace function pgflow.maybe_realtime_send(
  event_data jsonb,
  event_type text,
  realtime_channel text
)
returns void
language sql
set search_path to ''
volatile
as $$
SELECT realtime.send(
  event_data,
  event_type,
  realtime_channel,
  false
)
WHERE realtime_channel IS NOT NULL;
$$;