-- One row per reported UTC day. The unique day doubles as the dedup marker
-- (no separate state row) and the payload is the exact bytes that left the
-- database, so users can audit every report.
create table pgflow_telemetry.sent_reports (
  day date primary key,
  payload jsonb not null,
  request_id bigint,
  sent_at timestamptz not null default now()
);

comment on table pgflow_telemetry.sent_reports is
'Audit log of every telemetry payload sent; unique day is the dedup marker';
