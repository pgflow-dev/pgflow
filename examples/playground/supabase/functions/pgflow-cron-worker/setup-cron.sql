-- Setup pg_cron job for pgflow cron worker
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
WHERE jobname = 'pgflow-worker--analyze_website';

-- Create the cron job for analyze_website flow
-- Replace 'YOUR_PROJECT_REF' with your actual Supabase project reference
-- Replace 'YOUR_ANON_KEY' with your actual anon key (or use the setting approach below)
SELECT cron.schedule(
  'pgflow-worker--analyze_website',  -- job name
  '*/4 * * * * *',                  -- every 4 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/pgflow-cron-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := jsonb_build_object(
      'flow_slug', 'analyze_website',
      'batch_size', 10,
      'max_concurrent', 5,
      'cron_interval_seconds', 4
    ),
    timeout_milliseconds := 25000
  ) as request_id;
  $$
);

-- Alternative: Use database settings for anon key (more secure)
-- First set the anon key as a database setting:
-- ALTER DATABASE postgres SET app.supabase_anon_key = 'YOUR_ANON_KEY';

-- Then use this version of the cron job:
/*
SELECT cron.schedule(
  'pgflow-analyze-website-worker',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/pgflow-cron-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := jsonb_build_object(
      'flow_slug', 'analyze_website',
      'batch_size', 10,
      'max_concurrent', 5
    ),
    timeout_milliseconds := 25000
  ) as request_id;
  $$
);
*/

-- View scheduled jobs
SELECT * FROM cron.job;

-- View job run details (useful for debugging)
SELECT * FROM cron.job_run_details 
WHERE jobname = 'pgflow-worker--analyze_website'
ORDER BY start_time DESC 
LIMIT 10;

-- To unschedule the job later:
-- SELECT cron.unschedule('pgflow-worker--analyze_website');

-- Monitor pg_net requests (useful for debugging)
/*
SELECT 
  created,
  url,
  status_code,
  response_body,
  error_msg
FROM net._http_response
WHERE url LIKE '%pgflow-cron-worker%'
ORDER BY created DESC
LIMIT 10;
*/