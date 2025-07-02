# Retry Demo Edge Function

This edge function demonstrates the exponential backoff retry mechanism in pgflow edge-worker.

## Purpose

This function is designed for manual end-to-end testing of the retry feature. It intentionally fails for the first 3 attempts to showcase how exponential backoff works in practice.

## Setup

1. **Ensure Supabase is running:**
```bash
pnpm nx supabase:start edge-worker
```

2. **Start the edge function:**
```bash
./supabase/functions/retry-demo/serve.sh
```

3. **In another terminal, send a test message:**
```bash
./supabase/functions/retry-demo/test.sh
```

## What to Expect

The function will:
1. **Attempt 1**: Immediate failure
2. **Attempt 2**: Retry after ~2 seconds (base delay)
3. **Attempt 3**: Retry after ~4 seconds (2s × 2¹)
4. **Attempt 4**: Retry after ~8 seconds (2s × 2²) - SUCCESS

Watch the function logs to see timestamps and the calculated time between attempts.

## Configuration

The retry configuration used:
```typescript
{
  strategy: 'exponential',
  limit: 5,
  baseDelay: 2,  // Start with 2 seconds
  maxDelay: 20   // Cap at 20 seconds
}
```

## Files

- `index.ts` - The edge function that demonstrates retry behavior
- `test.sh` - Script to send test messages and optionally trigger the function
- `serve.sh` - Script to start the edge function with proper flags
- `README.md` - This file

## Troubleshooting

If the function doesn't start processing:
1. Make sure Supabase is running
2. Check that the queue was created: `SELECT * FROM pgmq.list_queues();`
3. Verify messages are in the queue: `SELECT * FROM pgmq.q_retry_demo;`
4. Try triggering manually: `curl -X POST http://localhost:50321/functions/v1/retry-demo`