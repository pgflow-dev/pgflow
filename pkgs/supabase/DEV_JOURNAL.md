# Dev Journal

This is a journal of development notes and thoughts for pgflow.

## 2024-12-16

### [x] Implement **retry_stale_step_tasks**

Some HTTP calls to edgefn can fail, so tasks can get stuck in queued state.

- implemented retry_stale_step_tasks() which just finds this kind of tasks and re-enqueues them (calls http again)
- decided to not split retry attempts with re-enqueue attempts - edgefn failing to start a task is a task failure for now for simplicity
- decided to not implement timeouts for edgefn worker - there is natural time limit to how long edgefn can run (150s free, 400s paid tier)
- dead letter queue is just one `select from step_tasks where attempt_count >= max_attempts` away

### [x] Small changes to pgflow_tests

I just removed mocks for start_step - we only ever need call_edgefn mocks for now.
I was considering writing tests in heavy-mock style but given the mocks are super
unwieldy to use (it is just a function that redefines other function),
i decided to use them only to prevent http calls in the tests
