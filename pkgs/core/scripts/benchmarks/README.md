# step_output_storage Benchmark

Measures performance improvements from storing step outputs in `step_states.output` instead of aggregating from `step_tasks` on every read.

## Quick Start

```bash
# From pkgs/core directory
pnpm nx supabase:reset core
pnpm nx supabase:status core  # Note the port

PGPASSWORD=postgres psql -h 127.0.0.1 -p PORT -U postgres -d postgres \
  -f scripts/benchmarks/step_output_storage.sql
```

## What Changed

### OLD Code (main branch)

In `start_tasks`, when a task needs its dependency outputs:

```sql
-- For each dependent task, aggregate all completed task outputs
CASE WHEN dep_step.step_type = 'map' THEN
  (SELECT jsonb_agg(dt.output ORDER BY dt.task_index)
   FROM pgflow.step_tasks dt
   WHERE dt.run_id = ... AND dt.status = 'completed')
ELSE ...
```

**Problem**: If a map step has 500 completed tasks, and 500 downstream tasks need to start, each downstream task triggers an aggregation query over 500 rows = **250,000 row scans**.

### NEW Code (step_output_storage branch)

Outputs are stored in `step_states.output` when a step completes:

```sql
-- Just read the pre-stored output
dep_state.output as dep_output
```

**Improvement**: 500 downstream tasks each read 1 column = **500 column reads**.

## Benchmark Tests

### Test 1: `complete_task_final`

**What it measures**: Time to complete the last task of a map step.

**Setup**: Start a flow with N-element array, complete N-1 tasks, then time the final `complete_task()`.

**Why it matters**: The final task triggers output storage. In NEW code, this aggregates once and stores. In OLD code, this just completes the task (aggregation happens on read).

### Test 2: `start_tasks_read_N`

**What it measures**: Time to start a single downstream task that reads N-element dependency output.

**Setup**:
1. Map step `producer` with N tasks - all completed
2. Single step `consumer` depends on `producer`
3. Time `start_tasks()` for the consumer task

**Flow structure**:
```
[producer: map(N)] --> [consumer: single]
```

**Expected difference**:
- OLD: Aggregates N task outputs on every read
- NEW: Reads from `step_states.output` (O(1))

### Test 3: `start_tasks_batch_NxN`

**What it measures**: Time to start N downstream tasks, each reading N-element dependency output.

**Setup**:
1. Map step `producer` with N tasks - all completed
2. Map step `consumer` depends on `producer`, has N tasks
3. Time `start_tasks()` for all N consumer tasks at once

**Flow structure**:
```
[producer: map(N)] --> [consumer: map(N)]
```

**Expected difference**:
- OLD: N tasks * aggregate(N outputs) = O(N^2) row scans
- NEW: N tasks * read(1 column) = O(N) column reads

**This is the key benchmark** - should show the largest improvement.

## Configuration

Edit line 19 to change array size:

```sql
\set ARRAY_SIZE 500  -- Default: ~3 min runtime
\set ARRAY_SIZE 100  -- Quick test: ~30 sec
\set ARRAY_SIZE 1000 -- Thorough: ~15+ min
```

## Comparing Branches

```bash
# 1. Run on step_output_storage branch
git checkout step_output_storage
pnpm nx supabase:reset core
psql ... -f scripts/benchmarks/step_output_storage.sql | tee results_new.txt

# 2. Run on main branch
git checkout main
pnpm nx supabase:reset core
psql ... -f scripts/benchmarks/step_output_storage.sql | tee results_old.txt

# 3. Compare start_tasks_batch_NxN results
grep "start_tasks_batch" results_*.txt
```

## Expected Results

| Test | OLD (main) | NEW (step_output_storage) | Improvement |
|------|------------|---------------------------|-------------|
| `complete_task_final` | ~same | ~same | minimal |
| `start_tasks_read_N` | slower | faster | 30-50% |
| `start_tasks_batch_NxN` | much slower | faster | 50-80% |

The batch test improvement grows with N because:
- OLD scales as O(N^2)
- NEW scales as O(N)
