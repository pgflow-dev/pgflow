-- Create extensions and required schemas for pgflow demo

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS cron;

-- Create net schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS net;

-- Grant permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
