# PgFlow Client Library Architecture (Updated)

This document outlines the internal architecture and design approach for the PgFlow client SDK with the Broadcast communication approach.

## Design Goals

- **Type Safety**: Full TypeScript type inference using DSL types
- **Framework Agnostic**: Core library with no framework dependencies
- **Testability**: Easy to mock for testing
- **Performance**: Optimize for fast state updates and minimal overhead
- **Simplicity**: Direct real-time Broadcast communication

## Core Components

The library consists of four main components:

1. **Client**: Main entry point for creating flow runs
2. **FlowRun**: State management for a single flow run
3. **FlowStep**: State management for a single step in a flow
4. **SupabaseBroadcastAdapter**: Handles real-time communication with the database

## Core Interfaces & Types

### Event Types

```typescript
// Flow run event types
export type FlowRunEvents<TFlow> = {
  started: {
    run_id: string;
    flow_slug: string;
    input: ExtractFlowInput<TFlow>;
    status: 'started';
    started_at: string;
  };
  completed: {
    run_id: string;
    output: ExtractFlowOutput<TFlow>;
    status: 'completed';
    completed_at: string;
  };
  failed: { 
    run_id: string; 
    error_message: string; 
    status: 'failed';
    failed_at: string;
  };
  // General event type that includes all events
  '*': { run_id: string; status: string; [key: string]: any };
};

// Step event types
export type StepEvents<
  TFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = {
  started: { 
    run_id: string; 
    step_slug: TStepSlug; 
    status: 'started';
    started_at: string;
  };
  completed: {
    run_id: string;
    step_slug: TStepSlug;
    output: StepOutput<TFlow, TStepSlug>;
    status: 'completed';
    completed_at: string;
  };
  failed: {
    run_id: string;
    step_slug: TStepSlug;
    error_message: string;
    status: 'failed';
    failed_at: string;
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

Following the Interface Segregation Principle, we maintain three focused interfaces:

```typescript
// For starting flows (used by everything)
export interface IFlowStarter {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flow_slug: string,
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
  fetchFlowDefinition(flow_slug: string): Promise<FlowDefinition>;

  /**
   * Register a callback for run events
   */
  onRunEvent(callback: (event: BroadcastRunEvent) => void): void;

  /**
   * Register a callback for step events
   */
  onStepEvent(callback: (event: BroadcastStepEvent) => void): void;

  /**
   * Subscribe to a flow run's events
   */
  subscribeToRun(run_id: string): () => void;

  /**
   * Fetch current state of a run and its steps
   */
  getRunWithStates(run_id: string): Promise<{ run: RunRow; steps: StepStateRow[] }>;
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
- **SupabaseBroadcastAdapter** implements `IFlowRealtime`

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

  // Get a reference to a specific step (step instances are cached by slug)
  step<TStepSlug extends keyof ExtractFlowSteps<TFlow> & string>(
    stepSlug: TStepSlug
  ): FlowStep<TFlow, TStepSlug>;

  // Wait for a specific status with a default timeout (5 minutes)
  async waitForStatus(
    targetStatus: 'completed' | 'failed',
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<this>;

  // Clean up resources (called automatically when run reaches terminal state with no listeners)
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

  // Wait for a specific status with a default timeout (5 minutes)
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
  // Cache step instances by slug to avoid duplicate objects and event emitters
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
5. Set up subscriptions for run and step events using Broadcast
6. Start the flow with the predetermined run_id using `pgflow.start_flow_with_states`
7. Update the run and step states with the complete initial state snapshot
8. Return the FlowRun instance

This sequence ensures that:

- Subscriptions are active before any events are emitted from the server
- The client has a complete initial state snapshot before any realtime events arrive
- Fast-completing steps are not missed due to network latency between subscription setup and the first event

### Broadcast Adapter Implementation

The SupabaseBroadcastAdapter implements the IFlowRealtime interface:

```typescript
export class SupabaseBroadcastAdapter implements IFlowRealtime {
  #supabase: SupabaseClient;
  #channels: Map<string, RealtimeChannel> = new Map();
  #runCallbacks: Set<(event: BroadcastRunEvent) => void> = new Set();
  #stepCallbacks: Set<(event: BroadcastStepEvent) => void> = new Set();
  
  constructor(supabase: SupabaseClient) {
    this.#supabase = supabase;
  }
  
  async fetchFlowDefinition(flow_slug: string): Promise<FlowDefinition> {
    // Implementation to fetch flow metadata from database
  }
  
  onRunEvent(callback: (event: BroadcastRunEvent) => void): void {
    this.#runCallbacks.add(callback);
  }
  
  onStepEvent(callback: (event: BroadcastStepEvent) => void): void {
    this.#stepCallbacks.add(callback);
  }
  
  subscribeToRun(run_id: string): () => void {
    const channelName = `pgflow:run:${run_id}`;
    const channel = this.#supabase.channel(channelName);
    
    // Subscribe to run events (e.g., run:started, run:completed, run:failed)
    channel.on('broadcast', { event: 'run:*' }, (payload) => {
      this.#runCallbacks.forEach(cb => cb(payload.payload));
    });
    
    // Subscribe to step events (e.g., step_slug:started, step_slug:completed, step_slug:failed)
    channel.on('broadcast', { event: '*:*' }, (payload) => {
      const eventParts = payload.event.split(':');
      if (eventParts.length === 2 && eventParts[0] !== 'run') {
        this.#stepCallbacks.forEach(cb => cb(payload.payload));
      }
    });
    
    channel.subscribe();
    this.#channels.set(run_id, channel);
    
    return () => this.#unsubscribe(run_id);
  }
  
  async getRunWithStates(run_id: string): Promise<{ run: RunRow; steps: StepStateRow[] }> {
    // Implementation to fetch current state
    const { data, error } = await this.#supabase.rpc('pgflow.get_run_with_states', {
      p_run_id: run_id
    });
    
    if (error) throw error;
    return data;
  }
  
  #unsubscribe(run_id: string): void {
    const channel = this.#channels.get(run_id);
    if (channel) {
      channel.unsubscribe();
      this.#channels.delete(run_id);
    }
  }
}
```

Key aspects of this implementation:

1. **Single Channel Subscription**:
   - Creates one realtime broadcast channel per run with format `pgflow:run:<run_id>`
   - Listens for all events related to the run and its steps on this channel

2. **Event Naming Convention**:
   - Run events: `run:started`, `run:completed`, `run:failed`
   - Step events: `<step_slug>:started`, `<step_slug>:completed`, `<step_slug>:failed`

3. **Efficient Event Handling**:
   - Uses a single broadcast channel for all events related to a run
   - Filters events client-side based on the event name pattern
   - Distributes events to appropriate callbacks

4. **Reconnection Handling**:
   - Tracks current subscription status
   - Provides method to fetch full state on reconnect
   - Handles WebSocket disconnections gracefully

## Required SQL Updates

See `client_library_sql_modifications.md` for detailed SQL function updates implementing the broadcast events.

Key additions include:

1. **Updated `pgflow.start_flow` function**:
   - Accept an optional run_id parameter
   - Send broadcast event for run:started

2. **New `pgflow.start_flow_with_states` function**:
   - Returns both run and step states in a single response
   - Provides complete initial state snapshot

3. **New `pgflow.get_run_with_states` function**:
   - Fetches current state of a run and all its steps
   - Used for refreshing state after reconnections

4. **Broadcast events in core functions**:
   - Added to `start_flow.sql`, `start_ready_steps.sql`, `complete_task.sql`, etc.
   - Consistently structured payloads for client consumption

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

### 3. Automatic Resource Cleanup

To prevent resource leaks, we implement automatic cleanup:

- Automatically dispose resources when a run reaches terminal state ('completed' or 'failed')
- Check if no event listeners remain before disposal
- Close Supabase channels and remove internal references
- Users can still manually call dispose() for early cleanup

### 4. Complete Initial State Snapshot

Our approach to state management involves:

- Fetching flow definition and metadata first
- Getting a complete initial state snapshot via `start_flow_with_states`
- Using this snapshot to initialize client-side state
- Then relying on real-time events for subsequent state updates

This hybrid approach gives us the benefits of both worlds:

- Complete initial state without missing fast-completing steps
- Real-time updates for changes that happen after initialization

### 5. Status Precedence

To handle out-of-order events, we maintain a status precedence system:

```typescript
private statusPrecedence: Record<string, number> = {
  'created': 0,
  'queued': 1,
  'started': 2,
  'completed': 3,
  'failed': 4,
};

// Prevent invalid state transitions and out-of-order events
shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentPrecedence = this.statusPrecedence[currentStatus] || 0;
  const newPrecedence = this.statusPrecedence[newStatus] || 0;

  // Only allow higher or equal precedence to replace current status
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
   - Single broadcast channel per flow run
   - Direct database-to-client event delivery
   - Type-safe event handling

3. **Race Condition Prevention**:
   - Client-generated UUID for pre-subscription
   - Set up subscriptions before starting the flow
   - Complete initial state snapshot

4. **Simple Implementation**:
   - No complex table-based subscriptions
   - Clear event naming convention
   - Direct mapping of database events to client-side state