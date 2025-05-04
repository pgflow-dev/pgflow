-- This migration fixes any issues that might occur with the pgflow initial migration
-- It ensures all required schemas and extensions exist

-- Ensure pgflow schema exists
do $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgflow') THEN
    CREATE SCHEMA "pgflow";
  END IF;
END
$$;

-- Ensure pgmq schema exists
do $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
    CREATE SCHEMA "pgmq";
  END IF;
END
$$;

-- Ensure pgmq extension exists
do $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgmq'
  ) THEN
    CREATE EXTENSION "pgmq" WITH SCHEMA "pgmq" VERSION "1.4.4";
  END IF;
END
$$;
