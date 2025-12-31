-- Fix for Supabase-managed extensions that may fail with "dependent privileges exist"
-- This migration runs BEFORE pgflow_worker_management to ensure extensions are ready
--
-- Problem: On Supabase, postgres user has privileges on cron.* tables granted both
-- by supabase_admin (with grant option) AND by itself. This creates "dependent privileges"
-- that cause CREATE EXTENSION IF NOT EXISTS to fail even when just skipping.
--
-- Fix: Revoke the self-granted privileges to break the dependency chain.

DO $$ BEGIN
  -- Revoke self-granted privileges on cron tables (if they exist)
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- These revokes remove the "postgres granted by postgres" entries
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM postgres';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA cron FROM postgres';
    EXECUTE 'REVOKE USAGE ON SCHEMA cron FROM postgres';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not revoke cron privileges: %', SQLERRM;
END $$;

-- Ensure pg_cron extension exists (handle Supabase-managed case)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension already managed by Supabase, skipping';
END $$;

-- Ensure pg_net extension exists
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net extension already managed by Supabase, skipping';
END $$;
