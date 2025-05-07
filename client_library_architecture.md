# PgFlow Client Library Architecture

This document outlines the internal architecture and design approach for the PgFlow client SDK.

## Design Goals

- **Type Safety**: Full TypeScript type inference using DSL types
- **Framework Agnostic**: Core library with no framework dependencies
- **Flexibility**: Ability to adapt to different backend communication strategies
- **Testability**: Easy to mock for testing
- **Performance**: Optimize for fast state updates and minimal overhead

## Core Components

The library consists of four main components:

1. **Client**: Main entry point for creating flow runs
2. **FlowRun**: State management for a single flow run
3. **FlowStep**: State management for a single step in a flow
4. **Adapter**: Backend communication abstraction

## Core Interfaces & Types

### Event Types

```typescript
// Flow run event types
export type FlowRunEvents<TFlow> = {
  completed: {
    run_id: string;
    output: ExtractFlowOutput<TFlow>;
    status: 'completed';
  };
  failed: { run_id: string; error_message: string; status: 'failed' };
  // General event type that includes all events
  '*': { run_id: string; status: string; [key: string]: any };
};

// Step event types
export type StepEvents<
  TFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = {
  started: { run_id: string; step_slug: TStepSlug; status: 'started' };
  completed: {
    run_id: string;
    step_slug: TStepSlug;
    output: StepOutput<TFlow, TStepSlug>;
    status: 'completed';
  };
  failed: {
    run_id: string;
    step_slug: TStepSlug;
    error_message: string;
    status: 'failed';
  };
  // General event type that includes all events
  '*': {
    run_id: string;
    step_slug: TStepSlug;
    status: string;
    [key: string]: any;
  };
};

// Function returned by event subscriptions to remove the listener
export type Unsubscribe = () => void;
```

### Interface Segregation

Following the Interface Segregation Principle, we split the adapter functionality into three focused interfaces:

```typescript
// For starting flows (used by everything)
export interface IFlowStarter {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flow: TFlow,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;
}

// For task processing (used by PgflowSqlClient and edge-worker)
export interface ITaskProcessor {
  /**
   * Poll for available tasks to process
   */
  pollForTasks(
    queueName: string,
    batchSize?: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number,
    visibilityTimeout?: number
  ): Promise<StepTaskRecord[]>;

  /**
   * Mark a task as completed with output
   */
  completeTask(stepTask: StepTaskKey, output?: Json): Promise<void>;

  /**
   * Mark a task as failed with error
   */
  failTask(stepTask: StepTaskKey, error: unknown): Promise<void>;
}

// For realtime updates (used by client library)
export interface IFlowRealtime {
  /**
   * Fetch flow definition metadata
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

// Composite interfaces for different use cases
export interface IPgflowClient<TFlow extends AnyFlow = AnyFlow>
  extends IFlowStarter,
    ITaskProcessor {}

export interface IFlowClient<TFlow extends AnyFlow = AnyFlow>
  extends IFlowStarter,
    IFlowRealtime {}
```

This segregation allows each component to depend only on the interfaces it needs:

- **Client** implements `IFlowClient` (which combines `IFlowStarter` and `IFlowRealtime`)
- **PgflowSqlClient** implements `IPgflowClient` (which combines `IFlowStarter` and `ITaskProcessor`)
- Individual adapters can implement the specific interfaces they support

### Interface Location

The interfaces should be distributed across packages as follows:

- **IFlowStarter** and **ITaskProcessor** interfaces belong in **pkgs/core/src/types.ts**

  - These are fundamental interfaces used by core components
  - PgflowSqlClient already exists in core and implements these
  - EdgeWorker depends on core, so this maintains the dependency structure

- **IFlowRealtime** and **IFlowClient** interfaces belong in the **new client package**
  - These are specific to the client-side real-time functionality
  - IFlowClient will import and extend IFlowStarter from core
  - Keeps client concerns separate from engine concerns

### Client API

```typescript
export class Client {
  constructor(supabaseClient: SupabaseClient);

  async startFlow<TFlow extends AnyFlow>(
    flowSlug: string,
    input: ExtractFlowInput<TFlow>,
    runId?: string
  ): Promise<FlowRun<TFlow>>;

  async observeRun<TFlow extends AnyFlow>(
    flowSlug: string,
    runId: string
  ): Promise<FlowRun<TFlow>>;

  dispose(runId: string): void;

  disposeAll(): void;
}
```

### FlowRun API

```typescript
export class FlowRun<TFlow> {
  // Public getters
  get run_id(): string;
  get flow_slug(): string;
  get status(): 'queued' | 'started' | 'completed' | 'failed';
  get started_at(): Date | null;
  get completed_at(): Date | null;
  get input(): ExtractFlowInput<TFlow>;
  get output(): ExtractFlowOutput<TFlow> | null;
  get error(): Error | null;
  get remaining_steps(): number;

  // Event subscription with NanoEvents
  on<E extends keyof FlowRunEvents<TFlow>>(
    event: E,
    callback: (event: FlowRunEvents<TFlow>[E]) => void
  ): Unsubscribe;

  // Get a reference to a specific step
  step<TStepSlug extends keyof ExtractFlowSteps<TFlow> & string>(
    stepSlug: TStepSlug
  ): FlowStep<TFlow, TStepSlug>;

  // Wait for a specific status
  async waitForStatus(
    targetStatus: 'completed' | 'failed',
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<this>;

  // Clean up resources
  dispose(): void;
}
```

### FlowStep API

```typescript
export class FlowStep<
  TFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> {
  // Public getters
  get step_slug(): TStepSlug;
  get status(): 'created' | 'started' | 'completed' | 'failed';
  get started_at(): Date | null;
  get completed_at(): Date | null;
  get failed_at(): Date | null;
  get output(): StepOutput<TFlow, TStepSlug> | null;
  get error(): Error | null;

  // Event subscription with NanoEvents
  on<E extends keyof StepEvents<TFlow, TStepSlug>>(
    event: E,
    callback: (event: StepEvents<TFlow, TStepSlug>[E]) => void
  ): Unsubscribe;

  // Wait for a specific status
  async waitForStatus(
    targetStatus: 'started' | 'completed' | 'failed',
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<this>;
}
```

## Implementation Overview

### State Management

Both `FlowRun` and `FlowStep` classes use private state with public getters:

```typescript
export class FlowRun<TFlow> {
  #state: FlowRunState<TFlow>;
  #events = createNanoEvents<FlowRunEvents<TFlow>>();
  #steps: Map<string, FlowStep<TFlow, any>> = new Map();
  #client: Client;

  // Public getters expose state properties
  get run_id(): string {
    return this.#state.run_id;
  }
  get status(): 'queued' | 'started' | 'completed' | 'failed' {
    return this.#state.status;
  }
  // ...other getters
}
```

This approach provides:

- Encapsulation of internal state
- Type-safe access to properties
- Prevents direct state mutations from outside

### Event System with NanoEvents

The library uses NanoEvents for event management:

```typescript
// Create an event emitter
#events = createNanoEvents<FlowRunEvents<TFlow>>();

// Subscribe to events
on<E extends keyof FlowRunEvents<TFlow>>(
  event: E,
  callback: (event: FlowRunEvents<TFlow>[E]) => void
): Unsubscribe {
  return this.#events.on(event, callback);
}

// Emit events (internal)
this.#events.emit('completed', {
  run_id: this.run_id,
  output: this.#state.output!,
  status: 'completed'
});
```

### Subscription Sequence

The `startFlow` method follows a carefully designed sequence to prevent race conditions:

1. Generate a client-side UUID if not provided
2. Fetch flow definition to know available steps
3. Create FlowRun instance with initial state
4. Store the run in the client's internal map
5. Set up subscriptions for run and step events
6. Start the flow with the predetermined run_id using `pgflow.start_flow_with_states`
7. Update the run and step states with the complete initial state snapshot
8. Return the FlowRun instance

This sequence ensures that:

- Subscriptions are active before any events are emitted from the server
- The client has a complete initial state snapshot before any realtime events arrive
- Fast-completing steps are not missed due to network latency between subscription setup and the first event

### Adapter Implementation

For Supabase, the adapter:

1. Uses postgres_changes realtime subscriptions
2. Listens for changes to runs and step_states tables
3. Enriches completed steps with their output
4. Maintains a status precedence system to handle out-of-order events
5. Implements NanoEvents for routing events to the client
6. Handles WebSocket disconnections by performing a full state refresh on reconnect:
   - Listens for the realtime connection 'open' event
   - Fetches current run and step state data on reconnect
   - Updates client state to reflect the latest server state
   - Prevents state drift between client and server

This simple reconnection approach also enables observing existing flow runs by ID without having to be present when they started.

## Required SQL Updates

The `pgflow.start_flow` function needs to be updated to accept an optional run_id parameter:

```sql
CREATE OR REPLACE FUNCTION pgflow.start_flow(
  p_flow_slug TEXT,
  p_input JSONB,
  p_run_id UUID DEFAULT NULL
) RETURNS SETOF pgflow.runs AS $$
  -- Function implementation
  -- Uses COALESCE(p_run_id, gen_random_uuid()) to prioritize client-provided UUID
$$ LANGUAGE plpgsql;
```

We also need a new function `pgflow.start_flow_with_states` that:

- Internally calls the existing `start_flow` function
- Fetches the full set of step states for the run
- Returns both the run and step states in a single response
- Provides clients with a complete initial state snapshot

Additionally, we need a function to fetch the current state of a run and its steps:

- Used for refreshing state after WebSocket reconnections
- Used for observing existing runs by ID
- Can be reused by `start_flow_with_states` internally to eliminate duplication

## Package Dependencies

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

### 3. Complete Initial State Snapshot

Our approach to state management involves:

- Fetching flow definition and metadata first
- Getting a complete initial state snapshot via `start_flow_with_states`
- Using this snapshot to initialize client-side state
- Then relying on realtime events for subsequent state updates

This hybrid approach gives us the benefits of both worlds:

- Complete initial state without missing fast-completing steps
- Real-time updates for changes that happen after initialization

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
   - Set up subscriptions before starting the flow
   - Remove need for event buffering logic

4. **Optimized Data Loading**:

   - Fetch only flow metadata initially
   - Rely on realtime events for state updates
   - Single-query approach for critical data

5. **Type Safety**:
   - Full type inference from DSL to client
   - Type-safe step access with FlowRun.step()
   - Type-safe event subscriptions
