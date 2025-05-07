# PgFlow Client Library Architecture

This document outlines the internal architecture and implementation approach for the PgFlow client SDK.

## Design Goals

- **Type Safety**: Full TypeScript type inference using DSL types
- **Framework Agnostic**: Core library with no framework dependencies
- **Flexibility**: Ability to adapt to different backend communication strategies
- **Testability**: Easy to mock for testing
- **Performance**: Optimize for fast state updates and minimal overhead

## Core Components

The library consists of three main components:

1. **Client**: Main entry point for creating flow runs
2. **FlowRun**: State management for a single flow run
3. **FlowStep**: State management for a single step in a flow
4. **Adapter**: Backend communication abstraction

## Component Architecture

### Client Class

The main entry point for applications to start and observe flows:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client, PostgresChangesAdapter } from '@pgflow/client';
import { v4 as uuidv4 } from 'uuid';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Client implementation for JavaScript environments
 * Supports both starting flows and observing their state
 */
export class Client {
  private adapter: Adapter;
  private runs: Map<string, FlowRun<any>> = new Map();
  
  constructor(supabaseClient: SupabaseClient) {
    // Always use PostgresChangesAdapter with the provided Supabase client
    this.adapter = new PostgresChangesAdapter(supabaseClient);
    
    // Set up event routing from adapter
    this.adapter.onRunEvent((runEvent) => {
      const run = this.runs.get(runEvent.run_id);
      if (run) {
        run._updateState(runEvent);
      }
    });
    
    this.adapter.onStepEvent((stepEvent) => {
      const run = this.runs.get(stepEvent.run_id);
      if (run) {
        run._routeStepEvent(stepEvent);
      }
    });
  }
  
  async startFlow<TFlow extends AnyFlow>(
    flowSlug: string,
    input: ExtractFlowInput<TFlow>,
    runId?: string
  ): Promise<FlowRun<TFlow>> {
    // Generate UUID if not provided
    const generatedRunId = runId || uuidv4();
    
    // 1. Fetch flow definition to know available steps
    await this.adapter.fetchFlowDefinition(flowSlug);
    
    // 2. Create FlowRun instance with initial state
    const flowRun = new FlowRun<TFlow>({
      run_id: generatedRunId,
      flow_slug: flowSlug,
      status: 'queued',
      input,
      started_at: null,
      completed_at: null,
      output: null,
      error: null,
      remaining_steps: 0
    }, this);
    
    // 3. Store the run instance
    this.runs.set(generatedRunId, flowRun);
    
    // 4. Set up subscriptions
    this.adapter.subscribeToRun(generatedRunId);
    this.adapter.subscribeToSteps(generatedRunId);
    
    // 5. Start the flow with our predetermined run_id
    const run = await this.adapter.startFlow(flowSlug, input, generatedRunId);
    
    // 6. Update the run with initial data
    flowRun._updateState(run);
    
    return flowRun;
  }
  
  dispose(runId: string): void {
    const run = this.runs.get(runId);
    if (run) {
      run._dispose();
      this.runs.delete(runId);
    }
  }
  
  disposeAll(): void {
    for (const runId of this.runs.keys()) {
      this.dispose(runId);
    }
  }
}
```

### FlowRun Class

The flow run class is responsible for managing a single flow run and its events:

```typescript
import { createNanoEvents } from 'nanoevents';
import type { AnyFlow, ExtractFlowInput, ExtractFlowOutput, ExtractFlowSteps, StepOutput } from '@pgflow/dsl';

// Event types
export type FlowRunEvents<TFlow> = {
  'completed': { run_id: string, output: ExtractFlowOutput<TFlow>, status: 'completed' };
  'failed': { run_id: string, error_message: string, status: 'failed' };
  // General event type that includes all events
  '*': { run_id: string, status: string, [key: string]: any };
};

export type Unsubscribe = () => void;

export class FlowRun<TFlow> {
  #state: FlowRunState<TFlow>;
  #events = createNanoEvents<FlowRunEvents<TFlow>>();
  #steps: Map<string, FlowStep<TFlow, any>> = new Map();
  #client: Client;
  
  constructor(initialState: FlowRunState<TFlow>, client: Client) {
    this.#state = initialState;
    this.#client = client;
  }
  
  // Public getters for state properties
  get run_id(): string { return this.#state.run_id; }
  get flow_slug(): string { return this.#state.flow_slug; }
  get status(): 'queued' | 'started' | 'completed' | 'failed' { return this.#state.status; }
  get started_at(): Date | null { return this.#state.started_at; }
  get completed_at(): Date | null { return this.#state.completed_at; }
  get input(): ExtractFlowInput<TFlow> { return this.#state.input; }
  get output(): ExtractFlowOutput<TFlow> | null { return this.#state.output; }
  get error(): Error | null { return this.#state.error; }
  get remaining_steps(): number { return this.#state.remaining_steps; }
  
  // Event subscription with NanoEvents
  on<E extends keyof FlowRunEvents<TFlow>>(
    event: E, 
    callback: (event: FlowRunEvents<TFlow>[E]) => void
  ): Unsubscribe {
    return this.#events.on(event, callback);
  }
  
  // Get a reference to a specific step
  step<TStepSlug extends keyof ExtractFlowSteps<TFlow> & string>(
    stepSlug: TStepSlug
  ): FlowStep<TFlow, TStepSlug> {
    let step = this.#steps.get(stepSlug as string);
    
    if (!step) {
      step = new FlowStep<TFlow, TStepSlug>(this.#state.run_id, stepSlug);
      this.#steps.set(stepSlug as string, step);
    }
    
    return step as FlowStep<TFlow, TStepSlug>;
  }
  
  // Wait for a specific status
  async waitForStatus(
    targetStatus: 'completed' | 'failed', 
    options?: { timeoutMs?: number, signal?: AbortSignal }
  ): Promise<this> {
    // If already in target status, return immediately
    if (this.status === targetStatus) {
      return this;
    }
    
    return new Promise((resolve, reject) => {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      if (options?.timeoutMs) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for flow to reach status '${targetStatus}'`));
        }, options.timeoutMs);
      }
      
      // Handle abort signal
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          if (timeoutId) clearTimeout(timeoutId);
          unsubscribe();
          reject(new Error(options.signal?.reason || 'Operation aborted'));
        }, { once: true });
      }
      
      // Subscribe to status change event
      const unsubscribe = this.on(targetStatus, () => {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(this);
      });
    });
  }
  
  // Clean up resources
  dispose(): void {
    this._dispose();
    this.#client.dispose(this.run_id);
  }
  
  // Internal methods
  _updateState(newState: Partial<FlowRunState<TFlow>>): void {
    const oldStatus = this.#state.status;
    this.#state = { ...this.#state, ...newState };
    
    // Emit events on status changes
    if (newState.status && newState.status !== oldStatus) {
      // Emit general event
      this.#events.emit('*', { ...this.#state });
      
      // Emit specific status event if applicable
      if (newState.status === 'completed') {
        this.#events.emit('completed', {
          run_id: this.run_id,
          output: this.#state.output!,
          status: 'completed'
        });
      } else if (newState.status === 'failed') {
        this.#events.emit('failed', {
          run_id: this.run_id,
          error_message: this.#state.error?.message || 'Unknown error',
          status: 'failed'
        });
      }
      
      // Auto-cleanup for terminal states
      if (['completed', 'failed'].includes(newState.status)) {
        // Wait a bit before cleaning up to allow event handlers to complete
        setTimeout(() => this.dispose(), 1000);
      }
    }
  }
  
  _routeStepEvent(stepEvent: StepStateRow): void {
    const stepSlug = stepEvent.step_slug;
    const step = this.#steps.get(stepSlug);
    
    if (step) {
      step._updateState(stepEvent);
    }
  }
  
  _dispose(): void {
    // Clean up step resources
    for (const step of this.#steps.values()) {
      step._dispose();
    }
    this.#steps.clear();
  }
}
```

### FlowStep Class

The step class manages state and events for a single step:

```typescript
import { createNanoEvents } from 'nanoevents';
import type { AnyFlow, ExtractFlowSteps, StepOutput } from '@pgflow/dsl';

// Step event types
export type StepEvents<TFlow, TStepSlug extends keyof ExtractFlowSteps<TFlow> & string> = {
  'started': { run_id: string, step_slug: TStepSlug, status: 'started' };
  'completed': { run_id: string, step_slug: TStepSlug, output: StepOutput<TFlow, TStepSlug>, status: 'completed' };
  'failed': { run_id: string, step_slug: TStepSlug, error_message: string, status: 'failed' };
  // General event type that includes all events
  '*': { run_id: string, step_slug: TStepSlug, status: string, [key: string]: any };
};

export class FlowStep<TFlow, TStepSlug extends keyof ExtractFlowSteps<TFlow> & string> {
  #state: StepState<TFlow, TStepSlug>;
  #events = createNanoEvents<StepEvents<TFlow, TStepSlug>>();
  
  constructor(runId: string, stepSlug: TStepSlug) {
    this.#state = {
      run_id: runId,
      step_slug: stepSlug,
      status: 'pending',
      started_at: null,
      completed_at: null,
      failed_at: null,
      output: null,
      error: null,
      remaining_tasks: 0,
      remaining_deps: 0
    };
  }
  
  // Public getters
  get step_slug(): TStepSlug { return this.#state.step_slug; }
  get status(): 'pending' | 'started' | 'completed' | 'failed' { return this.#state.status; }
  get started_at(): Date | null { return this.#state.started_at; }
  get completed_at(): Date | null { return this.#state.completed_at; }
  get failed_at(): Date | null { return this.#state.failed_at; }
  get output(): StepOutput<TFlow, TStepSlug> | null { return this.#state.output; }
  get error(): Error | null { return this.#state.error; }
  
  // Event subscription with NanoEvents
  on<E extends keyof StepEvents<TFlow, TStepSlug>>(
    event: E,
    callback: (event: StepEvents<TFlow, TStepSlug>[E]) => void
  ): Unsubscribe {
    return this.#events.on(event, callback);
  }
  
  // Wait for a specific status
  async waitForStatus(
    targetStatus: 'started' | 'completed' | 'failed',
    options?: { timeoutMs?: number, signal?: AbortSignal }
  ): Promise<this> {
    // If already in target status, return immediately
    if (this.status === targetStatus) {
      return this;
    }
    
    return new Promise((resolve, reject) => {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      if (options?.timeoutMs) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for step to reach status '${targetStatus}'`));
        }, options.timeoutMs);
      }
      
      // Handle abort signal
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          if (timeoutId) clearTimeout(timeoutId);
          unsubscribe();
          reject(new Error(options.signal?.reason || 'Operation aborted'));
        }, { once: true });
      }
      
      // Subscribe to status change event
      const unsubscribe = this.on(targetStatus, () => {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(this);
      });
    });
  }
  
  // Internal methods
  _updateState(newState: Partial<StepState<TFlow, TStepSlug>>): void {
    const oldStatus = this.#state.status;
    this.#state = { ...this.#state, ...newState };
    
    // Emit events on status changes
    if (newState.status && newState.status !== oldStatus) {
      // Emit general event
      this.#events.emit('*', { ...this.#state });
      
      // Emit specific status event if applicable
      if (newState.status === 'started') {
        this.#events.emit('started', {
          run_id: this.#state.run_id,
          step_slug: this.#state.step_slug,
          status: 'started'
        });
      } else if (newState.status === 'completed') {
        this.#events.emit('completed', {
          run_id: this.#state.run_id,
          step_slug: this.#state.step_slug,
          output: this.#state.output!,
          status: 'completed'
        });
      } else if (newState.status === 'failed') {
        this.#events.emit('failed', {
          run_id: this.#state.run_id,
          step_slug: this.#state.step_slug,
          error_message: this.#state.error?.message || 'Unknown error',
          status: 'failed'
        });
      }
    }
  }
  
  _dispose(): void {
    // NanoEvents doesn't require explicit cleanup
  }
}
```

### Adapter System

The adapter interface and implementation for Supabase:

```typescript
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { RunRow, StepStateRow } from '@pgflow/core';
import { createNanoEvents } from 'nanoevents';

/**
 * Adapter interface for clients
 */
export interface Adapter {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flowSlug: string,
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

// Define event types for the adapter
interface AdapterEvents {
  runEvent: (run: RunRow) => void;
  stepEvent: (step: StepStateRow) => void;
}

/**
 * Adapter for Supabase using PostgresChanges for realtime updates
 */
export class PostgresChangesAdapter implements Adapter {
  private client: SupabaseClient;
  private emitter = createNanoEvents<AdapterEvents>();
  private flowDefinitions: Map<string, any> = new Map();
  private statusPrecedence: Record<string, number> = {
    'created': 0,
    'queued': 1,
    'started': 2,
    'completed': 3,
    'failed': 4,
    'cancelled': 5
  };
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  async startFlow<TFlow extends AnyFlow>(
    flowSlug: string,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    // Call the Supabase RPC function with optional run_id
    const { data, error } = await this.client.rpc('pgflow_start_flow', {
      p_flow_slug: flowSlug,
      p_input: input,
      p_run_id: run_id  // Pass the client-generated UUID if provided
    });
    
    if (error) throw error;
    
    // Extract the first element from the SETOF result
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    
    throw new Error(`Failed to start flow ${flowSlug}`);
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

## Key Features and Optimizations

### 1. NanoEvents for Event Management

Using NanoEvents provides several benefits:

- Tiny footprint (only 108 bytes)
- Simple API with just `on` and `emit`
- Returns unbind function directly
- Type-safe events

### 2. Client-Generated UUID

By letting the client generate the run_id, we can:
- Set up subscriptions before starting the flow
- Eliminate race conditions with event delivery
- Create a more reliable subscription model

### 3. Flow Definition First Approach

Instead of fetching the entire run state (including step_states and step_tasks), we only fetch:
- Flow definition and metadata
- Steps that belong to the flow

Then we rely on realtime events to populate run and step states as they happen.

### 4. Encapsulated State with Getters

Using private class fields with public getters provides:
- Clean API for accessing state properties
- Encapsulation of internal state
- Type-safe access to properties
- Prevents consumers from directly modifying state

### 5. Status Precedence

To handle out-of-order events, we implement a status precedence system:

```typescript
private statusPrecedence: Record<string, number> = {
  'created': 0,
  'queued': 1,
  'started': 2,
  'completed': 3,
  'failed': 4,
  'cancelled': 5
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

1. **Clean API Design**:
   - Private state with public getters for encapsulation
   - NanoEvents for simple event subscription with `.on()`
   - Intuitive FlowRun and FlowStep classes

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

5. **Type Safety**:
   - Full type inference from DSL to client
   - Type-safe step access with FlowRun.step()
   - Type-safe event subscriptions
