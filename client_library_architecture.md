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
3. **State Management**: Flow run and step state handling with NanoEvents

## Component Architecture

### Client

The main entry point for applications to start and observe flows, using NanoEvents for event management:

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
import { createNanoEvents } from 'nanoevents';

// Define event types for type-safety
interface RunEvents {
  [runId: string]: (run: RunRow) => void;
}

interface StepEvents {
  [runId: string]: (step: StepStateRow) => void;
}

/**
 * Client implementation for JavaScript environments
 * Supports both starting flows and observing their state
 */
export class Client<TFlow extends AnyFlow> 
  implements IFlowStarter, IFlowObserver<TFlow> 
{
  private adapter: Adapter;
  private runEmitter = createNanoEvents<RunEvents>();
  private stepEmitter = createNanoEvents<StepEvents>();
  private disposeFunctions: Map<string, Array<() => void>> = new Map();
  
  constructor(adapter: Adapter) {
    this.adapter = adapter;
    
    // Set up event handling from adapter
    this.adapter.onRunEvent((run) => {
      const runId = run.id;
      
      // Emit event to all subscribers for this run
      this.runEmitter.emit(runId, run);
      
      // Auto-cleanup for terminal states
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        this.dispose(runId);
      }
    });
    
    this.adapter.onStepEvent((step) => {
      const runId = step.run_id;
      
      // Emit event to all subscribers for this run's steps
      this.stepEmitter.emit(runId, step);
    });
  }
  
  async startFlow(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    // Generate UUID if not provided
    const runId = run_id || uuidv4();
    
    // 1. Set up empty subscriptions FIRST to ensure adapter is ready
    // The dummy subscriptions will be automatically cleaned up if no real subscribers arrive
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
    // First subscriber? Set up adapter subscription
    const isFirst = !this.hasRunSubscribers(run_id);
    
    // Add event subscription using NanoEvents
    const unbind = this.runEmitter.on(run_id, callback);
    
    if (isFirst) {
      // Set up subscription in adapter if this is first subscriber
      const adapterUnbind = this.adapter.subscribeToRun(run_id);
      this.addDisposeFunction(run_id, adapterUnbind);
    }
    
    // Return combined unsubscribe function
    return () => {
      // Remove this specific callback
      unbind();
      
      // If no more subscribers, clean up adapter subscription
      if (!this.hasRunSubscribers(run_id) && !this.hasStepSubscribers(run_id)) {
        this.dispose(run_id);
      }
    };
  }
  
  subscribeToStepEvents(
    run_id: string,
    callback: (step: StepStateRow) => void
  ): () => void {
    // First subscriber? Set up adapter subscription
    const isFirst = !this.hasStepSubscribers(run_id);
    
    // Add event subscription using NanoEvents
    const unbind = this.stepEmitter.on(run_id, callback);
    
    if (isFirst) {
      // Set up subscription in adapter if this is first subscriber
      const adapterUnbind = this.adapter.subscribeToSteps(run_id);
      this.addDisposeFunction(run_id, adapterUnbind);
    }
    
    // Return combined unsubscribe function
    return () => {
      // Remove this specific callback
      unbind();
      
      // If no more subscribers, clean up adapter subscription
      if (!this.hasRunSubscribers(run_id) && !this.hasStepSubscribers(run_id)) {
        this.dispose(run_id);
      }
    };
  }
  
  private hasRunSubscribers(run_id: string): boolean {
    return this.runEmitter.events[run_id]?.length > 0;
  }
  
  private hasStepSubscribers(run_id: string): boolean {
    return this.stepEmitter.events[run_id]?.length > 0;
  }
  
  private addDisposeFunction(run_id: string, fn: () => void): void {
    if (!this.disposeFunctions.has(run_id)) {
      this.disposeFunctions.set(run_id, []);
    }
    this.disposeFunctions.get(run_id)!.push(fn);
  }
  
  dispose(run_id: string): void {
    // Execute all dispose functions for this run
    const disposeFns = this.disposeFunctions.get(run_id) || [];
    disposeFns.forEach(fn => fn());
    
    // Remove event subscriptions using NanoEvents
    // NanoEvents doesn't have a built-in "removeAllListeners" so we create empty maps
    // The TypeScript definition may complain, but this is the official way to remove all listeners
    if (this.runEmitter.events[run_id]) {
      this.runEmitter.events[run_id] = [];
    }
    
    if (this.stepEmitter.events[run_id]) {
      this.stepEmitter.events[run_id] = [];
    }
    
    // Clear dispose functions
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
import { createNanoEvents } from 'nanoevents';

// Define event types for the adapter
interface AdapterEvents {
  runEvent: (run: RunRow) => void;
  stepEvent: (step: StepStateRow) => void;
}

/**
 * Adapter for Supabase using PostgresChanges for realtime updates
 */
export class SupabaseAdapter implements Adapter {
  private client: SupabaseClient;
  private emitter = createNanoEvents<AdapterEvents>();
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
    // Use NanoEvents to register the callback
    this.emitter.on('runEvent', callback);
  }
  
  onStepEvent(callback: (step: StepStateRow) => void): void {
    // Use NanoEvents to register the callback
    this.emitter.on('stepEvent', callback);
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
        
        // Emit event to all listeners
        this.emitter.emit('runEvent', currentRun);
      })
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }
  
  subscribeToSteps(run_id: string): () => void {
    // Set up a channel that listens for step_states changes
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
          this.emitter.emit('stepEvent', enrichedStep);
        } else {
          // For non-completed steps, just emit the event
          this.emitter.emit('stepEvent', step);
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

## Package Dependencies

To implement this architecture, add NanoEvents to the dependencies:

```json
{
  "dependencies": {
    "nanoevents": "^7.0.1",
    "uuid": "^9.0.0"
  }
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

### 1. NanoEvents for Event Management

Using NanoEvents provides several benefits:

```typescript
// Creating an emitter with typed events
const emitter = createNanoEvents<RunEvents>();

// Subscribing (returns unbind function)
const unbind = emitter.on(runId, callback);

// Unsubscribing is straightforward
unbind();
```

Benefits:
- Tiny footprint (only 108 bytes)
- Simple API with just `on` and `emit`
- Returns unbind function directly
- Type-safe events

### 2. Client-Generated UUID

By letting the client generate the run_id, we can:
- Set up subscriptions before starting the flow
- Eliminate race conditions with event delivery
- Create a more reliable subscription model

```typescript
// Generate UUID client-side
const runId = uuidv4();

// Set up subscriptions for this ID immediately
const unbind = pgflow.subscribeToRunEvents(runId, callback);

// Start flow with our predetermined ID
const run = await pgflow.startFlow(flow, input, runId);
```

### 3. Flow Definition First Approach

Instead of fetching the entire run state (including step_states and step_tasks), we only fetch:
- Flow definition and metadata
- Steps that belong to the flow

Then we rely on realtime events to populate run and step states as they happen. This approach:
- Requires fewer queries
- Reduces initial data transfer
- Still provides all the necessary type information

### 4. Status Precedence

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

## Summary

This architecture provides:

1. **Clear Interface Separation**:
   - `IFlowStarter` - For starting flows (SQL client, client)
   - `IFlowObserver` - For observing flow runs and steps (client)
   - `ITaskExecutor` - For executing tasks (SQL client, edge worker)

2. **Efficient Event Management**:
   - Uses NanoEvents for lightweight, memory-efficient event handling
   - Returns clean unbind functions for easy subscription management
   - Type-safe events for better developer experience

3. **Race Condition Prevention**:
   - Client-generated UUID for pre-subscription
   - Set up all subscriptions before starting the flow
   - Remove need for event buffering logic

4. **Optimized Data Loading**:
   - Fetch only flow metadata initially
   - Rely on realtime events for state updates
   - Single-query approach for critical data

5. **Backward Compatibility**:
   - `IPgflowClient` extends both `IFlowStarter` and `ITaskExecutor`
   - Optional run_id parameter maintains compatibility with existing code

This design creates a more robust, efficient client library while maintaining compatibility with existing code and allowing for future extensions.