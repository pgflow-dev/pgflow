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

#### Glossary

- `worker` - instance of given worker edge function that is subject to CPU and memory limits and can be killed
- `worker function` - edge function within supabase app that uses Supaworker instead of serving requests
- `queue` - pgmq queue that workers can pull from
- `message` - PGMQ `message_record` that contains metadata (`msg_id`, `read_ct`, `vt`) and payload (`message JSONB`)

#### Worker naming convention

```sh
functions/
├── read-payload-worker/
├── shared-queue-reader-a-worker/
├── shared-queue-reader-b-worker/
├── always-fail-worker/
├── retry-success-worker/
└── slow-process-worker/
```

### [ ] Happy Path

- [x] Worker picks messages from queue
- [ ] Worker calls handler function with each message
- [x] Worker can process big amounts of messages (restarts itself when CPU clock limit hits)
- [ ] Different worker functions can pull from different queues
- [ ] Different worker functions can pull from the same queue

✅ Worker Lifecycle

- [ ] Worker registers on start
- [ ] Worker sends heartbeats every 5s
- [ ] Worker updates edge_fn_name with heartbeat

✅ Retries & Failures

- [ ] Worker retries failed jobs n-times and succeeds
- [ ] Worker uses exponential backoff for each subsequent retry
- [ ] Worker uses proper number of retries for each job
- [ ] Worker archives jobs that will not be retried

✅ Concurrency

- [x] Worker respects maxConcurrent and processes messages in serial when set to 1
