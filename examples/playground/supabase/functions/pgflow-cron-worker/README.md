# pgflow Cron Worker

This Edge Function implements a cron-based worker architecture for pgflow, designed to be triggered by pg_cron instead of running as a persistent worker.

## Dependencies

This function requires:
- `@pgflow/edge-worker@0.3.1` - For internal worker components
- `@pgflow/core@0.3.1` - For PgflowSqlClient
- `@pgflow/dsl@0.3.1` - For flow type definitions
- `postgres@3.4.5` - PostgreSQL client

Make sure all versions are aligned with what edge-worker expects.

## Environment Variables

This function uses the same environment variables as other Edge Workers. The required `EDGE_WORKER_DB_URL` is already configured in `supabase/functions/.env`.

## How it works

Unlike the traditional Edge Worker that runs continuously, this function:
- Processes a single batch of tasks per HTTP request
- Is triggered periodically by pg_cron
- Completes and terminates after processing
- Avoids the scaling issues of persistent Edge Workers

## Usage

### 1. Deploy the function

```bash
supabase functions deploy pgflow-cron-worker
```

### 2. Set up pg_cron

Create a cron job in your database to trigger the worker:

```sql
-- Schedule polling every 5 seconds
SELECT cron.schedule(
  'pgflow-analyze-website-worker',
  '*/5 * * * * *',  -- Every 5 seconds
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/pgflow-cron-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := jsonb_build_object(
      'flow_slug', 'analyze_website',
      'batch_size', 10,
      'max_concurrent', 5
    ),
    timeout_milliseconds := 25000  -- 25 second timeout
  ) as request_id;
  $$
);
```

### 3. Test the function

You can test the function directly:

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/pgflow-cron-worker \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "flow_slug": "analyze_website",
    "batch_size": 10,
    "max_concurrent": 5
  }'
```

## Configuration

The function accepts the following parameters:

- `flow_slug` (required): The slug of the flow to process tasks for
- `batch_size` (optional, default: 10): Number of tasks to poll in a single batch
- `max_concurrent` (optional, default: 5): Maximum concurrent task executions

## Monitoring

The function returns JSON responses with:
- `status`: "completed" or "error"
- `flow_slug`: The flow that was processed
- `batch_size`: Number of tasks requested
- `max_concurrent`: Concurrency limit used
- `worker_id`: Unique ID of this worker instance
- `error`: Error message (only on failure)

## Adding more flows

To add support for more flows, edit `index.ts` and add your flow to the `flows` Map:

```typescript
import myNewFlow from '../_flows/my_new_flow.ts';

const flows = new Map<string, AnyFlow>([
  ['analyze_website', analyzeWebsiteFlow],
  ['my_new_flow', myNewFlow],  // Add your flow here
]);
```

Then create a corresponding pg_cron job for the new flow.