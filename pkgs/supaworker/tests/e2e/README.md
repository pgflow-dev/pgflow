# E2E Testing Strategy

We use a real Supabase instance running locally (in `supabase/`) to perform end-to-end testing of the entire Supaworker stack. The tests interact with purpose-built test workers that simulate different behaviors:

- Different queues with specific behaviors
- Workers that always fail
- Workers with varying retry patterns
- etc.

The test flow is straightforward:
1. Put messages on specific queues
2. `await sleep(ms)` to allow workers to process
3. Assert that workers behaved as expected (retries, failures, etc.)

This approach lets us verify the entire stack from message enqueueing through worker processing, retries, and completion.

## Core Test Scenarios Needed

✅ Happy Path
- Enqueue simple job
- Verify worker picks it up
- Check job completion and side effects
- Assert proper archival

✅ Retries & Failures
- Test job that fails N times then succeeds
- Verify retry delays and counts
- Check final archival state

✅ Concurrency
- Enqueue batch of jobs
- Verify maxConcurrency is respected
- Assert all jobs complete eventually

✅ Worker Lifecycle
- Verify worker registration on start
- Check heartbeat updates
- Test worker marked inactive when killed
- Verify jobs reassigned to other workers

✅ Queue-Specific Behaviors
- Test different queue configurations
- Verify queue-specific retry policies
- Check queue-specific job handling
