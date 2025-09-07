# Queue-Based Task Completion

## Queue Assignment per Step

Each step has a `queue` column that determines how tasks are completed:

* **`queue = 'queue_name'`**: Tasks sent to specified queue, processed by workers polling that queue
* **`queue = NULL`**: Tasks created in 'started' status, **no queue message sent**, completed via API/UI

## DSL Syntax

```typescript
// Default queue (uses flow_slug as queue name)
.step({ slug: 'process_data' }, handler)
.map({ slug: 'transform_items', array: 'items' }, handler)

// Custom queue  
.step({ slug: 'send_email', queue: 'email_worker' }, handler)
.map({ slug: 'resize_images', array: 'images', queue: 'image_worker' }, handler)

// Direct completion (no queue)
.step({ slug: 'await_payment', queue: false })  // No handler allowed
.map({ slug: 'gather_responses', array: 'surveys', queue: false })  // No handler allowed
```

## Database Storage

```sql
-- steps table
ALTER TABLE pgflow.steps ADD COLUMN queue TEXT;

-- step_tasks table - inherits queue from step for performance and safety
ALTER TABLE pgflow.step_tasks ADD COLUMN queue TEXT;

-- Examples:
-- queue = 'user_onboarding'  (default: flow_slug)
-- queue = 'email_worker'     (custom queue)  
-- queue = NULL               (direct completion)
```

## Queue Information in Tasks

Tasks inherit and store queue information from their step definition:

```sql
-- Task creation copies queue from step
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, queue, message_id)
SELECT started_step.flow_slug, started_step.run_id, started_step.step_slug,
       step.queue,  -- Inherit from step
       msg_id 
FROM started_steps 
JOIN pgflow.steps step ON 
  step.flow_slug = started_step.flow_slug AND 
  step.step_slug = started_step.step_slug;

-- Schema safety: unique message_id per queue
ALTER TABLE step_tasks ADD CONSTRAINT unique_msg_per_queue 
  UNIQUE (queue, message_id) WHERE message_id IS NOT NULL;

-- Performance: fast worker queries without joins
SELECT * FROM step_tasks 
WHERE queue = 'email_worker'
AND message_id = ANY(polled_msg_ids);
```

## Task Type Identification

Queue field provides immediate task type identification:

```sql
-- Direct completion tasks (manual, API, webhook)
SELECT * FROM step_tasks WHERE queue IS NULL;

-- Worker-processed tasks
SELECT * FROM step_tasks WHERE queue IS NOT NULL;

-- Specific worker tasks  
SELECT * FROM step_tasks WHERE queue = 'email_worker';
```

## Worker Deployment Patterns

```typescript
// Specialized workers
const emailWorker = new PgflowWorker({ queues: ['email_worker'] });
const imageWorker = new PgflowWorker({ queues: ['image_worker'] });

// Multi-queue worker
const generalWorker = new PgflowWorker({ 
  queues: ['user_onboarding', 'data_pipeline', 'notifications'] 
});
```

## Validation Rules

* **`queue = NULL`**: Handler is forbidden (compiler enforces)
* **`queue != NULL`**: Handler is required (compiler enforces)
* **Workers**: Only process tasks from queues they're configured to poll

*(Workers remain oblivious to branching/ghosts; they only process queued tasks.)*
