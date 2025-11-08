-- Remove existing job if it exists to prevent duplicates
select cron.unschedule(jobname)
from cron.job
where jobname = 'watchdog--article_flow_worker';

-- Create cron job to keep article_flow_worker running
-- Checks every 5 seconds if worker is alive and spawns new one if needed
select cron.schedule(
  'watchdog--article_flow_worker',
  '2 seconds',
  $$
  SELECT net.http_post(
    url := 'http://host.docker.internal:54321/functions/v1/article_flow_worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    ),
    timeout_milliseconds := 25000
  ) AS request_id
  WHERE (
    SELECT COUNT(DISTINCT worker_id) FROM pgflow.workers
    WHERE function_name = 'article_flow_worker'
      AND last_heartbeat_at > NOW() - make_interval(secs => 6)
  ) < 1;
  $$
);
