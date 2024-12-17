# Dev Journal

This is a journal of development notes and thoughts for pgflow.

## 2024-12-16

First day in Reza - my coding reatreat to finish and release pgflow.

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

### [x] Decided on migration/CLI strategy

I evaluated following tools for managing SQL migrations:

- pgroll - not really helping
- migra - 2y without a commit :-(, otherwise very good
- pgdiff - similar to migra, but seems not very active
- pgrebase - not very active, does not allow generating diff as migration
- tern/dbmate/pgmigrate/graphile-migrate/liquibase/flyway - all based on the versioned approach
- squitch - weird versioning approach
- ariga/atlas - perfect tool for the job, supports hybrid declarative+versioning approach, but paid

I decided to go with Atlas, its perfect and checks all the boxes.
9$ per month for a single user, but there is some kind of Hacker License for OSS maintainers,
which i will try to get.

CI/CD runs for free with a paid account.

## 2024-12-17

### [ ] Implement **pgmq** queue

I started to implement pgmq queue because i had troubles with the retries logic for pgflow-3 implementation.
The main trouble is that running a flow with lot of root steps is slow becuase each root step is a http call to edgefn.

#### Notes from a walk

- enqueue_step_task() is the only function that is called from DB and must be polymorphically dispatched (if multiple backends)
- this function just puts the payload into the queue, the same payload that would be sent via http to edgefn
- all other \*\_step_task() functions are backend-specific and can live in separate namespace and JS handlers can call them from that schema
- i plan to implement pgmq worker in pgflow_pgmq schema
- need a pgflow_pgmq.read_queued_step_tasks(batchSize) function that will read n-messages from the queue
- this function needs to find the related step tasks and it should return them, not the job itself
- async iterator's job is to read batch of messages and executeTask() each of them in eventloop

#### Simple work plan

- [ ] Make MVP for the worker that uses executeTask in the simplest way possible
