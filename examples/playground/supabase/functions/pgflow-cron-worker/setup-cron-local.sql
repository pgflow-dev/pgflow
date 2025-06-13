-- Setup pg_cron job for pgflow cron worker (LOCAL DEVELOPMENT)
-- This creates a cron job that triggers the Edge Function every 5 seconds

-- First, ensure pg_cron and pg_net extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions (if not already granted)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- Remove existing job if it exists to prevent duplicates
SELECT cron.unschedule(jobname) 
FROM cron.job 
WHERE jobname = 'pgflow-analyze-website-worker';

-- Create the cron job for analyze_website flow (LOCAL VERSION)
-- This uses localhost URLs for local development
SELECT cron.schedule(
  'pgflow-analyze-website-worker',  -- job name
  '5 seconds',                      -- run every 5 seconds using interval syntax
  $$
  SELECT net.http_post(
    url := 'http://host.docker.internal:54321/functions/v1/pgflow-cron-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    ),
    body := jsonb_build_object(
      'flow_slug', 'analyze_website',
      'batch_size', 5,
      'max_concurrent', 3
    ),
    timeout_milliseconds := 25000
  ) as request_id;
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent job runs
-- Note: Column names may vary by pg_cron version
-- This query attempts to show job execution details

-- To unschedule the job:
-- SELECT cron.unschedule('pgflow-analyze-website-worker');

-- Monitor pg_net requests (useful for debugging)
-- Check the net._http_response table for request logs
-- SELECT * FROM net._http_response ORDER BY id DESC LIMIT 10;