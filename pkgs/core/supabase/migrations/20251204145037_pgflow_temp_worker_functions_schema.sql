-- Modify "workers" table
ALTER TABLE "pgflow"."workers" ADD COLUMN "stopped_at" timestamptz NULL;
-- Create "worker_functions" table
CREATE TABLE "pgflow"."worker_functions" (
  "function_name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "heartbeat_timeout_seconds" integer NOT NULL DEFAULT 6,
  "last_invoked_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("function_name")
);
-- Set comment to table: "worker_functions"
COMMENT ON TABLE "pgflow"."worker_functions" IS 'Registry of edge functions that run pgflow workers, used by ensure_workers() cron';
-- Set comment to column: "function_name" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."function_name" IS 'Name of the Supabase Edge Function';
-- Set comment to column: "enabled" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."enabled" IS 'Whether ensure_workers() should ping this function';
-- Set comment to column: "heartbeat_timeout_seconds" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."heartbeat_timeout_seconds" IS 'How long before considering a worker dead (no heartbeat)';
-- Set comment to column: "last_invoked_at" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."last_invoked_at" IS 'When ensure_workers() last pinged this function (used for debouncing)';
