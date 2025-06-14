# Deploying pgflow Cron Worker to Supabase

This guide explains how to deploy the pgflow cron worker to your hosted Supabase project.

## Prerequisites

- Supabase CLI installed and configured
- Access to your Supabase project dashboard
- Your project's anon key and URL

## Step 1: Deploy the Edge Function

Deploy the pgflow-cron-worker edge function to your Supabase project:

```bash
supabase functions deploy pgflow-cron-worker
```

## Step 2: Set Environment Variables

In your Supabase dashboard:

1. Go to Settings → Edge Functions
2. Find `pgflow-cron-worker`
3. Add the following environment variable:
   - `EDGE_WORKER_DB_URL`: Your database connection string (use the connection pooler URL from Settings → Database)

## Step 3: Enable Required Extensions

Run this SQL in your Supabase SQL editor:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;
```

## Step 4: Create the Cron Job

Replace the placeholders and run this SQL in your Supabase SQL editor:

```sql
-- Remove existing job if it exists
SELECT cron.unschedule(jobname) 
FROM cron.job 
WHERE jobname = 'pgflow-worker--analyze_website';

-- Create the cron job
-- Replace YOUR_PROJECT_REF with your Supabase project reference (e.g., 'abcdefghijklmnop')
-- Replace YOUR_ANON_KEY with your project's anon key
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
```

## Step 5: Verify the Deployment

Check that the cron job is created:

```sql
-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'pgflow-worker--analyze_website';

-- Check recent job runs (after a minute)
SELECT * FROM cron.job_run_details 
WHERE jobname = 'pgflow-worker--analyze_website'
ORDER BY start_time DESC 
LIMIT 10;

-- Monitor HTTP requests
SELECT 
  created,
  url,
  status_code,
  response_body
FROM net._http_response
WHERE url LIKE '%pgflow-cron-worker%'
ORDER BY created DESC
LIMIT 10;
```

## Configuration Parameters

When creating the cron job, you must provide all these parameters:

- `flow_slug`: The slug of the flow to process
- `batch_size`: Number of tasks to process in each batch
- `max_concurrent`: Maximum concurrent task executions
- `cron_interval_seconds`: How often the cron runs (should match your cron schedule)

## Adjusting the Schedule

The cron schedule uses standard cron syntax. Common examples:

- `*/4 * * * * *` - Every 4 seconds
- `*/30 * * * * *` - Every 30 seconds
- `* * * * *` - Every minute
- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour

Remember to update `cron_interval_seconds` in the request body to match your schedule.

## Stopping the Cron Job

To stop the cron job:

```sql
SELECT cron.unschedule('pgflow-worker--analyze_website');
```

## Troubleshooting

1. **Function not found**: Ensure the edge function is deployed
2. **Authentication errors**: Verify your anon key is correct
3. **No tasks processing**: Check that the flow exists and has pending tasks
4. **Worker registration errors**: Ensure the pgflow workers table exists

## Security Note

For production, consider storing your anon key as a database setting instead of hardcoding it:

```sql
-- Set the anon key as a database setting
ALTER DATABASE postgres SET app.supabase_anon_key = 'YOUR_ANON_KEY';

-- Then use this in your cron job
'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
```