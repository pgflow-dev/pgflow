# PgFlow Client Library Architecture

This document outlines the internal architecture and implementation approach for the PgFlow client SDK.

## Design Goals

- **Type Safety**: Full TypeScript type inference using DSL types
- **Framework Agnostic**: Core library with no framework dependencies
- **Flexibility**: Ability to adapt to different backend communication strategies
- **Testability**: Easy to mock for testing
- **Performance**: Optimize for fast state updates and minimal overhead

## Core Interfaces

We'll introduce three distinct interfaces that separate concerns clearly:

### 1. IFlowStarter

```typescript
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { RunRow } from '@pgflow/core';

/**
 * Interface for starting workflow flows
 */
export interface IFlowStarter {
  /**
   * Starts a flow with the given input
   * 
   * @param flow - The flow definition
   * @param input - Input data for the flow
   * @param run_id - Optional UUID for the run. If provided, this exact ID will be used
   * @returns Promise with the flow run record
   */
  startFlow<TFlow extends AnyFlow>(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;
}
```

### 2. IFlowObserver

```typescript
import type { AnyFlow } from '@pgflow/dsl';
import type { RunRow, StepStateRow } from '@pgflow/core';

/**
 * Interface for observing flow run and step state changes
 */
export interface IFlowObserver<TFlow extends AnyFlow = AnyFlow> {
  /**
   * Subscribe to flow run events
   * 
   * @param run_id - The run ID to observe
   * @param callback - Function to call when the run state changes
   * @returns Unsubscribe function
   */
  subscribeToRunEvents(
    run_id: string,
    callback: (run: RunRow) => void
  ): () => void;
  
  /**
   * Subscribe to step state events
   * 
   * @param run_id - The run ID to observe
   * @param callback - Function to call when any step state changes
   * @returns Unsubscribe function
   */
  subscribeToStepEvents(
    run_id: string,
    callback: (step: StepStateRow) => void
  ): () => void;
  
  /**
   * Clean up all subscriptions for a run
   * 
   * @param run_id - The run ID to clean up
   */
  dispose(run_id: string): void;
  
  /**
   * Clean up all subscriptions for all runs
   */
  disposeAll(): void;
}
```

### 3. ITaskExecutor

```typescript
import type { AnyFlow } from '@pgflow/dsl';
import type { StepTaskKey, StepTaskRecord, Json } from '@pgflow/core';

/**
 * Interface for executing flow tasks
 */
export interface ITaskExecutor<TFlow extends AnyFlow = AnyFlow> {
  /**
   * Fetches tasks from pgflow
   * 
   * @param queueName - Name of the queue to poll
   * @param batchSize - Number of tasks to fetch
   * @param maxPollSeconds - Maximum time to poll for tasks
   * @param pollIntervalMs - Poll interval in milliseconds
   * @param visibilityTimeout - Visibility timeout for tasks
   */
  pollForTasks(
    queueName: string,
    batchSize?: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number,
    visibilityTimeout?: number
  ): Promise<StepTaskRecord<TFlow>[]>;

  /**
   * Marks a task as completed
   * 
   * @param stepTask - Step task key containing run_id and step_slug
   * @param output - Output payload for the task
   */
  completeTask(stepTask: StepTaskKey, output?: Json): Promise<void>;

  /**
   * Marks a task as failed
   * 
   * @param stepTask - Step task key containing run_id and step_slug
   * @param error - Error to fail task with
   */
  failTask(stepTask: StepTaskKey, error: unknown): Promise<void>;
}
```

## Core Components

The library consists of three main components:

1. **Client**: Entry point for creating flow runs and observing state
2. **Adapter**: Backend communication abstraction
3. **State Management**: Flow run and step state handling

## Component Architecture

### Client

The main entry point for applications to start and observe flows:

```typescript
import type { 
  IFlowStarter, 
  IFlowObserver, 
  RunRow, 
  StepStateRow 
} from './types';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import { Adapter } from './adapter';
import { v4 as uuidv4 } from 'uuid';

/**
 * Client implementation for JavaScript environments
 * Supports both starting flows and observing their state
 */
export class Client<TFlow extends AnyFlow> 
  implements IFlowStarter, IFlowObserver<TFlow> 
{
  private adapter: Adapter;
  private runSubscriptions: Map<string, Array<(run: RunRow) => void>> = new Map();
  private stepSubscriptions: Map<string, Array<(step: StepStateRow) => void>> = new Map();
  private disposeFunctions: Map<string, () => void> = new Map();
  
  constructor(adapter: Adapter) {
    this.adapter = adapter;
    
    // Set up event handling from adapter
    this.adapter.onRunEvent((run) => {
      const runId = run.id;
      const callbacks = this.runSubscriptions.get(runId) || [];
      callbacks.forEach(callback => callback(run));
      
      // Auto-cleanup for terminal states
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        this.dispose(runId);
      }
    });
    
    this.adapter.onStepEvent((step) => {
      const runId = step.run_id;
      const callbacks = this.stepSubscriptions.get(runId) || [];
      callbacks.forEach(callback => callback(step));
    });
  }
  
  async startFlow(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    // Generate UUID if not provided
    const runId = run_id || uuidv4();
    
    // 1. Set up subscriptions FIRST to catch all events
    this.subscribeToRunEvents(runId, () => {});
    this.subscribeToStepEvents(runId, () => {});
    
    // 2. Fetch flow definition to know available steps
    await this.adapter.fetchFlowDefinition(flow.slug);
    
    // 3. Start the flow with our predetermined run_id
    return this.adapter.startFlow(flow, input, runId);
  }
  
  subscribeToRunEvents(
    run_id: string,
    callback: (run: RunRow) => void
  ): () => void {
    // Initialize handlers array if needed
    if (!this.runSubscriptions.has(run_id)) {
      this.runSubscriptions.set(run_id, []);
      
      // Set up subscription in adapter if this is first subscriber
      const unsubscribe = this.adapter.subscribeToRun(run_id);
      this.addDisposeFunction(run_id, unsubscribe);
    }
    
    // Add callback to subscribers
    const callbacks = this.runSubscriptions.get(run_id)!;
    callbacks.push(callback);
    
    // Return unsubscribe function for this specific callback
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      
      // If no more callbacks, clean up subscription
      if (callbacks.length === 0) {
        this.dispose(run_id);
      }
    };
  }
  
  subscribeToStepEvents(
    run_id: string,
    callback: (step: StepStateRow) => void
  ): () => void {
    // Initialize handlers array if needed
    if (!this.stepSubscriptions.has(run_id)) {
      this.stepSubscriptions.set(run_id, []);
      
      // Set up subscription in adapter if this is first subscriber
      const unsubscribe = this.adapter.subscribeToSteps(run_id);
      this.addDisposeFunction(run_id, unsubscribe);
    }
    
    // Add callback to subscribers
    const callbacks = this.stepSubscriptions.get(run_id)!;
    callbacks.push(callback);
    
    // Return unsubscribe function for this specific callback
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      
      // If no more callbacks, clean up subscription
      if (callbacks.length === 0) {
        this.dispose(run_id);
      }
    };
  }
  
  private addDisposeFunction(run_id: string, fn: () => void): void {
    const disposeFns = this.disposeFunctions.get(run_id) || [];
    disposeFns.push(fn);
    this.disposeFunctions.set(run_id, disposeFns);
  }
  
  dispose(run_id: string): void {
    // Execute all dispose functions
    const disposeFns = this.disposeFunctions.get(run_id) || [];
    disposeFns.forEach(fn => fn());
    
    // Clear subscriptions and dispose functions
    this.runSubscriptions.delete(run_id);
    this.stepSubscriptions.delete(run_id);
    this.disposeFunctions.delete(run_id);
  }
  
  disposeAll(): void {
    // Get all run IDs and dispose each one
    const runIds = Array.from(this.disposeFunctions.keys());
    runIds.forEach(id => this.dispose(id));
  }
}
```

### Adapter System

We'll implement a generic adapter interface and a Supabase implementation:

```typescript
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { RunRow, StepStateRow } from '@pgflow/core';

/**
 * Adapter interface for clients
 */
export interface Adapter {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;
  
  /**
   * Fetch flow definition (metadata only)
   */
  fetchFlowDefinition(flow_slug: string): Promise<void>;
  
  /**
   * Register a callback for run events
   */
  onRunEvent(callback: (run: RunRow) => void): void;
  
  /**
   * Register a callback for step events
   */
  onStepEvent(callback: (step: StepStateRow) => void): void;
  
  /**
   * Subscribe to run state changes
   */
  subscribeToRun(run_id: string): () => void;
  
  /**
   * Subscribe to step state changes
   */
  subscribeToSteps(run_id: string): () => void;
}
```

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { RunRow, StepStateRow } from '@pgflow/core';

/**
 * Adapter for Supabase using PostgresChanges for realtime updates
 */
export class SupabaseAdapter implements Adapter {
  private client: SupabaseClient;
  private runEventListener: ((run: RunRow) => void) | null = null;
  private stepEventListener: ((step: StepStateRow) => void) | null = null;
  private flowDefinitions: Map<string, any> = new Map();
  private statusPrecedence: Record<string, number> = {
    'created': 0,
    'running': 1,
    'completed': 2,
    'failed': 3,
    'cancelled': 4
  };
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  async startFlow<TFlow extends AnyFlow>(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    // Call the Supabase RPC function with optional run_id
    const { data, error } = await this.client.rpc('pgflow_start_flow', {
      p_flow_slug: flow.slug,
      p_input: input,
      p_run_id: run_id  // Pass the client-generated UUID if provided
    });
    
    if (error) throw error;
    
    // Extract the first element from the SETOF result
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    
    throw new Error(`Failed to start flow ${flow.slug}`);
  }
  
  async fetchFlowDefinition(flow_slug: string): Promise<void> {
    // Only fetch flow definition if we don't have it cached
    if (!this.flowDefinitions.has(flow_slug)) {
      // Fetch just the flow and its steps (not states or tasks)
      const { data, error } = await this.client
        .from('flows')
        .select(`
          *,
          steps:steps(*)
        `)
        .eq('slug', flow_slug)
        .single();
        
      if (error) {
        console.error('Error fetching flow definition:', error);
        return;
      }
      
      // Cache the flow definition
      this.flowDefinitions.set(flow_slug, data);
    }
  }
  
  onRunEvent(callback: (run: RunRow) => void): void {
    this.runEventListener = callback;
  }
  
  onStepEvent(callback: (step: StepStateRow) => void): void {
    this.stepEventListener = callback;
  }
  
  subscribeToRun(run_id: string): () => void {
    // Subscribe to changes - we rely on realtime events for initial state
    const channel = this.client
      .channel(`run-${run_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'pgflow',
        table: 'runs',
        filter: `id=eq.${run_id}`
      }, (payload) => {
        const currentRun = payload.new as RunRow;
        if (this.runEventListener) {
          this.runEventListener(currentRun);
        }
      })
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }
  
  subscribeToSteps(run_id: string): () => void {
    // Set up a channel that listens for both step_states and step_tasks changes
    const channel = this.client
      .channel(`steps-${run_id}`)
      // Listen for step_states changes
      .on('postgres_changes', {
        event: '*',
        schema: 'pgflow',
        table: 'step_states',
        filter: `run_id=eq.${run_id}`
      }, async (payload) => {
        const step = payload.new as StepStateRow;
        
        // For completed steps, we need to get the output from step_tasks
        if (step.status === 'completed') {
          // Fetch output from step_tasks
          const enrichedStep = await this.enrichStepWithOutput(step);
          if (this.stepEventListener) {
            this.stepEventListener(enrichedStep);
          }
        } else {
          // For non-completed steps, just emit the event
          if (this.stepEventListener) {
            this.stepEventListener(step);
          }
        }
      })
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }
  
  private async enrichStepWithOutput(step: StepStateRow): Promise<StepStateRow> {
    // Fetch output from step_tasks table
    const { data, error } = await this.client
      .from('step_tasks')
      .select('output')
      .eq('run_id', step.run_id)
      .eq('step_slug', step.step_slug)
      .eq('task_index', 0)  // Currently only supporting single-task steps
      .single();
      
    if (error || !data) {
      return step;
    }
    
    // Merge output into step
    return {
      ...step,
      output: data.output
    };
  }
  
  // Handle status precedence for out-of-order events
  shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
    const currentPrecedence = this.statusPrecedence[currentStatus] || 0;
    const newPrecedence = this.statusPrecedence[newStatus] || 0;
    return newPrecedence >= currentPrecedence;
  }
}
```

### Updates to PgflowSqlClient

The existing `PgflowSqlClient` will be updated to implement both `IFlowStarter` and `ITaskExecutor` interfaces:

```typescript
import type { 
  IFlowStarter, 
  ITaskExecutor, 
  StepTaskRecord, 
  StepTaskKey, 
  RunRow, 
  Json 
} from './types.js';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Implementation that uses direct SQL calls to pgflow functions
 */
export class PgflowSqlClient<TFlow extends AnyFlow>
  implements IFlowStarter, ITaskExecutor<TFlow>
{
  // Implementation remains the same, just update the interface and add run_id
  constructor(private readonly sql: postgres.Sql) {}

  async pollForTasks(
    queueName: string,
    batchSize = 20,
    maxPollSeconds = 5,
    pollIntervalMs = 200,
    visibilityTimeout = 2
  ): Promise<StepTaskRecord<TFlow>[]> {
    // Implementation remains the same
    return await this.sql<StepTaskRecord<TFlow>[]>`
      SELECT *
      FROM pgflow.poll_for_tasks(
        queue_name => ${queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  async completeTask(stepTask: StepTaskKey, output?: Json): Promise<void> {
    // Implementation remains the same
    await this.sql`
      SELECT pgflow.complete_task(
        run_id => ${stepTask.run_id}::uuid,
        step_slug => ${stepTask.step_slug}::text,
        task_index => ${0}::int,
        output => ${this.sql.json(output || null)}::jsonb
      );
    `;
  }

  async failTask(stepTask: StepTaskKey, error: unknown): Promise<void> {
    // Implementation remains the same
    const errorString =
      typeof error === 'string'
        ? error
        : error instanceof Error
        ? error.message
        : JSON.stringify(error);

    await this.sql`
      SELECT pgflow.fail_task(
        run_id => ${stepTask.run_id}::uuid,
        step_slug => ${stepTask.step_slug}::text,
        task_index => ${0}::int,
        error_message => ${errorString}::text
      );
    `;
  }

  async startFlow(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    // Update to use client-provided run_id if available
    const results = await this.sql<RunRow[]>`
      SELECT * FROM pgflow.start_flow(
        ${flow.slug}::text, 
        ${this.sql.json(input)}::jsonb, 
        ${run_id ? `${run_id}::uuid` : 'NULL'}
      );
    `;

    if (results.length === 0) {
      throw new Error(`Failed to start flow ${flow.slug}`);
    }

    const [flowRun] = results;
    return flowRun;
  }
}
```

## Required SQL Updates

The `pgflow.start_flow` function needs to be updated to accept an optional run_id parameter:

```sql
CREATE OR REPLACE FUNCTION pgflow.start_flow(
  p_flow_slug TEXT,
  p_input JSONB,
  p_run_id UUID DEFAULT NULL
) RETURNS SETOF pgflow.runs AS $$
DECLARE
  v_flow_id UUID;
  v_run_id UUID;
  v_flow_record pgflow.flows;
BEGIN
  -- Get flow_id from slug
  SELECT * INTO v_flow_record FROM pgflow.flows WHERE slug = p_flow_slug;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flow with slug "%" not found', p_flow_slug;
  END IF;
  
  v_flow_id := v_flow_record.id;
  
  -- Use provided run_id if available, otherwise generate new UUID
  v_run_id := COALESCE(p_run_id, gen_random_uuid());
  
  -- Create the run record
  INSERT INTO pgflow.runs (
    id, flow_id, flow_slug, input, status, remaining_steps, started_at
  ) VALUES (
    v_run_id, v_flow_id, p_flow_slug, p_input, 'started', 0, now()
  ) RETURNING *;
  
  -- Continue with the rest of the function logic...
  
  RETURN QUERY SELECT * FROM pgflow.runs WHERE id = v_run_id;
END;
$$ LANGUAGE plpgsql;
```

## Integration with React (Example)

```tsx
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Client, SupabaseAdapter } from '@pgflow/client';
import { myFlow } from './flows';
import type { RunRow, StepStateRow } from '@pgflow/core';
import { v4 as uuidv4 } from 'uuid';

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Create PgFlow client with Supabase adapter
const adapter = new SupabaseAdapter(supabase);
const pgflow = new Client(adapter);

function FlowRunner() {
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunRow | null>(null);
  const [stepStates, setStepStates] = useState<Record<string, StepStateRow>>({});
  
  // Start the flow
  const startFlow = async () => {
    try {
      // Generate a UUID client-side
      const newRunId = uuidv4();
      
      // Set up subscriptions immediately
      const unsubscribeRun = pgflow.subscribeToRunEvents(newRunId, (run) => {
        setRunState(run);
      });
      
      const unsubscribeSteps = pgflow.subscribeToStepEvents(newRunId, (step) => {
        setStepStates(prev => ({
          ...prev,
          [step.step_slug]: step
        }));
      });
      
      // Start the flow with our predetermined run_id
      const run = await pgflow.startFlow(myFlow, { 
        url: 'https://example.com' 
      }, newRunId);
      
      setRunId(run.id);
    } catch (error) {
      console.error('Failed to start flow:', error);
    }
  };
  
  return (
    <div>
      <h1>PgFlow Example</h1>
      {!runId ? (
        <button onClick={startFlow}>Start Flow</button>
      ) : (
        <div>
          <h2>Run: {runId}</h2>
          <p>Status: {runState?.status}</p>
          
          <h3>Steps</h3>
          <ul>
            {Object.values(stepStates).map(step => (
              <li key={step.step_slug}>
                {step.step_slug}: {step.status}
                {step.status === 'failed' && (
                  <p className="error">{step.error_message}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Updates to Core Package

1. Export the new interfaces from `@pgflow/core`:

```typescript
// pkgs/core/src/types.ts
// Add to existing exports

import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Interface for starting workflow flows
 */
export interface IFlowStarter {
  startFlow<TFlow extends AnyFlow>(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;
}

/**
 * Interface for observing flow run and step state changes
 */
export interface IFlowObserver<TFlow extends AnyFlow = AnyFlow> {
  subscribeToRunEvents(
    run_id: string,
    callback: (run: RunRow) => void
  ): () => void;
  
  subscribeToStepEvents(
    run_id: string,
    callback: (step: StepStateRow) => void
  ): () => void;
  
  dispose(run_id: string): void;
  
  disposeAll(): void;
}

/**
 * Interface for executing flow tasks
 */
export interface ITaskExecutor<TFlow extends AnyFlow = AnyFlow> {
  pollForTasks(
    queueName: string,
    batchSize?: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number,
    visibilityTimeout?: number
  ): Promise<StepTaskRecord<TFlow>[]>;

  completeTask(stepTask: StepTaskKey, output?: Json): Promise<void>;

  failTask(stepTask: StepTaskKey, error: unknown): Promise<void>;
}

// Update the existing interface
export interface IPgflowClient<TFlow extends AnyFlow = AnyFlow> extends IFlowStarter, ITaskExecutor<TFlow> {}
```

## Edge Worker Integration

The edge worker will continue to use `IPgflowClient`, which now extends both `IFlowStarter` and `ITaskExecutor`. This provides backward compatibility while allowing new code to depend on the more specific interfaces.

## Key Features and Optimizations

### 1. Client-Generated UUID

By letting the client generate the run_id, we can:
- Set up subscriptions before starting the flow
- Eliminate race conditions with event delivery
- Create a more reliable subscription model

```typescript
// Generate UUID client-side
const newRunId = uuidv4();

// Set up subscriptions for this ID immediately
pgflow.subscribeToRunEvents(newRunId, callback);
pgflow.subscribeToStepEvents(newRunId, callback);

// Start flow with our predetermined ID
const run = await pgflow.startFlow(flow, input, newRunId);
```

### 2. Flow Definition First Approach

Instead of fetching the entire run state (including step_states and step_tasks), we only fetch:
- Flow definition and metadata
- Steps that belong to the flow

Then we rely on realtime events to populate run and step states as they happen. This approach:
- Requires fewer queries
- Reduces initial data transfer
- Still provides all the necessary type information

### 3. Status Precedence

To handle out-of-order events:

```typescript
private statusPrecedence: Record<string, number> = {
  'created': 0,
  'running': 1,
  'completed': 2,
  'failed': 3,
  'cancelled': 4
};

// Prevent invalid state transitions
shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentPrecedence = this.statusPrecedence[currentStatus] || 0;
  const newPrecedence = this.statusPrecedence[newStatus] || 0;
  return newPrecedence >= currentPrecedence;
}
```

### 4. Resource Management

Auto-cleanup prevents memory leaks:

```typescript
// Auto-cleanup for terminal states
if (['completed', 'failed', 'cancelled'].includes(run.status)) {
  this.dispose(runId);
}
```

## Summary

This architecture provides:

1. **Clear Interface Separation**:
   - `IFlowStarter` - For starting flows (SQL client, client)
   - `IFlowObserver` - For observing flow runs and steps (client)
   - `ITaskExecutor` - For executing tasks (SQL client, edge worker)

2. **Race Condition Prevention**:
   - Client-generated UUID for pre-subscription
   - Set up all subscriptions before starting the flow
   - Remove need for event buffering logic

3. **Optimized Data Loading**:
   - Fetch only flow metadata initially
   - Rely on realtime events for state updates
   - Single-query approach for critical data

4. **Backward Compatibility**:
   - `IPgflowClient` extends both `IFlowStarter` and `ITaskExecutor`
   - Optional run_id parameter maintains compatibility with existing code

This design creates a more robust, efficient client library while maintaining compatibility with existing code and allowing for future extensions.