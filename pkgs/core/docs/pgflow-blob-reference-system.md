# PgFlow Blob Reference System

## Overview

PgFlow needs an efficient way to handle large data outputs from workflow steps. The Blob Reference System provides a solution by separating large data payloads from workflow control information while maintaining a seamless developer experience.

## How It Works

### Core Concept

When steps produce large outputs (e.g., HTML content from web scraping, binary data, large API responses), these outputs are stored separately in a dedicated blob storage table. The workflow state maintains references to these blobs rather than storing the actual large data.

### Database Structure

The system uses a dedicated table for blob storage:

```sql
CREATE TABLE pgflow.output_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Worker Task Structure

The `poll_for_tasks` function returns tasks with both regular inputs and blob references through a custom type:

```sql
CREATE TYPE pgflow.step_task_record AS (
  flow_slug TEXT,
  run_id UUID,
  step_slug TEXT,
  input JSONB,
  blobs_refs JSONB
);
```

This design provides a clean separation between:

- `input`: Regular small data that can be directly included in the task
- `blobs_refs`: References to large data stored separately in the blob table

### Example Return Value

A task returned by `poll_for_tasks` might look like:

```json
{
  "flow_slug": "my_flow",
  "run_id": "1234-5678-90ab-cdef",
  "step_slug": "my_step",
  "input": {
    "run": "run input",
    "dependency_a": "dependency_a output"
  },
  "blobs_refs": {
    "dependency_b": "<uuid to the blob saved for dependency_b which returned binary data>"
  }
}
```

In this example:

- `dependency_a` had a small output that's included directly in the `input` object
- `dependency_b` had a large output (possibly binary data) that's stored as a blob, with only a reference included

### Queue Efficiency

A critical optimization in PgFlow is that the task queue only stores minimal task identification information:

- flow_slug
- run_id
- step_slug
- task_index

This lightweight approach keeps queue messages small and efficient. When a worker picks up a task, it uses these identifiers to:

1. Call `poll_for_tasks` to get the full task data
2. Receive both the regular `input` and `blobs_refs` in a single query result
3. Fetch the actual blob content for any referenced blobs
4. Combine all data to form the complete input for the task handler

## Implementation Flow

### Task Creation

1. When a step completes, its output is analyzed:

   - Outputs below the size threshold remain in the regular output JSONB
   - Large outputs are stored in the `pgflow.output_blobs` table with a unique ID

2. The `start_ready_steps` function:
   - Creates task entries with references to any large blob data
   - Enqueues only the task identifiers (not the actual data) in the task queue

### Task Execution

1. Worker picks up the task identifier from the queue
2. Worker calls `poll_for_tasks` to get the task details
3. `poll_for_tasks` returns:
   - The `input` object with regular data
   - The `blobs_refs` object with references to any large data outputs
4. Worker fetches blob content for any references in `blobs_refs`
5. Worker assembles the complete input (combining regular data and blob data) for the task handler
6. Task handler executes with the complete data, unaware of the blob reference system

### Example Processing Flow

For a web scraping workflow:

1. `fetch-html` step returns a large HTML string (3MB)
2. System detects the large output and:
   - Stores HTML in `pgflow.output_blobs` with ID "abc-123"
   - Records only the blob reference in the step's output
3. When `parse-html` step is ready to run:
   - Queue contains only the task identifier
   - `poll_for_tasks` returns the task with:
     ```json
     {
       "input": {
         "run": { "url": "https://example.com" }
       },
       "blobs_refs": {
         "fetch-html": "abc-123"
       }
     }
     ```
4. Worker:
   - Detects the blob reference "abc-123" for "fetch-html"
   - Fetches the actual HTML content from the blob table
   - Provides the handler with complete input including the HTML content

## Developer Experience

From a workflow developer's perspective, the blob reference system is completely transparent:

```typescript
// Developer writes code as if all data is directly available
const parseHtmlHandler: StepHandler<ParseInput, ParseOutput> = async (
  input
) => {
  // input.dependencies["fetch-html"] contains the full HTML content
  // (the blob reference was automatically resolved)
  const html = input.dependencies['fetch-html'];

  // Process the HTML...
  const title = extractTitle(html);
  const links = extractLinks(html);

  return { title, links };
};
```

The developer never needs to:

- Manually resolve blob references
- Check if data is a reference or actual content
- Handle storage of large outputs differently

## Benefits and Considerations

### Benefits

1. **Database Efficiency**: Large data is stored separately from workflow metadata
2. **Queue Performance**: Queue messages remain small and consistent in size
3. **Separation of Concerns**: Control flow data is separate from large payloads
4. **Transparent to Developers**: No special code required to handle large data
5. **Scalability**: Can handle arbitrary data sizes without affecting workflow system performance

### Considerations

1. **Query Optimization**: Ensure `poll_for_tasks` efficiently retrieves both regular data and blob references
2. **Blob Lifecycle Management**: Implement cleanup for orphaned or expired blobs
3. **Size Threshold Tuning**: Configure appropriate thresholds for when data should use blob storage

## Conclusion

The Blob Reference System in PgFlow provides an elegant solution for handling large data in workflows. By splitting task data into regular inputs and blob references, the system maintains efficient database usage and queue performance while providing a seamless experience for workflow developers. The design ensures that large data is handled appropriately without requiring developers to write special code for blob resolution or storage.
