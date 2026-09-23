-- Self-contained telemetry schema: droppable without touching pgflow engine
-- objects. The cron.job row is the enabled switch; no settings table.
create schema if not exists pgflow_telemetry;

revoke all on schema pgflow_telemetry from public;
