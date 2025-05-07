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

1. **Client**: Entry point for creating flow runs
2. **Adapter**: Backend communication abstraction
3. **State Management**: Flow run and step state handling

## Component Architecture

### PgflowClient

The main entry point for the library. Creates flow runs and provides access to flows.

```typescript
class PgflowClient {
  #adapter: PgflowAdapter;
  
  constructor(supabase: SupabaseClient, options?: PgflowClientOptions) {
    // Create appropriate adapter based on options
  }
  
  async startFlow<TFlow>(flowSlug: string, input: ExtractFlowInput<TFlow>): Promise<FlowRun<TFlow>> {
    // Use adapter to start flow, fetch initial state, and create FlowRun
  }
}
```

### Adapter Pattern

An adapter abstracts all backend communication, allowing different implementations with the same interface.

```typescript
// Simple event types without prefixes
type RunEvent = {
  run_id: string;
  flow_slug: string;
  status: 'started' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  input: any;
  output: any | null;
  remaining_steps: number;
};

type StepEvent = {
  run_id: string;
  flow_slug: string;
  step_slug: string;
  status: 'created' | 'started' | 'completed' | 'failed';
  remaining_tasks: number;
  remaining_deps: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  output: any | null;
  error_message: string | null;
};

type FlowEvent = RunEvent | StepEvent;

interface PgflowAdapter {
  // Start a new flow
  startFlow<TFlow>(flowSlug: string, input: any): Promise<string>; // Returns run_id
  
  // Fetch full state of a run
  fetchRunState<TFlow>(runId: string): Promise<FlowRunState<TFlow>>;
  
  // Subscribe to real-time updates
  subscribeToRun(runId: string, onUpdate: (event: FlowEvent) => void): Promise<() => void>;
  
  // Cleanup subscriptions
  unsubscribe(): void;
}
```

#### Implementation Strategies

1. **Standard Adapter**: Uses Supabase Data API + Postgres Changes
2. **Optimized Adapter**: Uses direct RPC functions + Broadcast

```typescript
// Standard implementation
class SupabaseStandardAdapter implements PgflowAdapter {
  #supabase: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  
  constructor(supabase: SupabaseClient) {
    this.#supabase = supabase;
  }
  
  async startFlow<TFlow>(flowSlug: string, input: any): Promise<string> {
    // Implementation using supabase.rpc('pgflow.start_flow')
  }
  
  async fetchRunState<TFlow>(runId: string): Promise<FlowRunState<TFlow>> {
    // Implementation using supabase select with joins
  }
  
  async subscribeToRun(runId: string, onUpdate: (event: any) => void): Promise<() => void> {
    // Implementation using postgres_changes
  }
  
  unsubscribe(): void {
    // Channel cleanup
  }
}
```

### State Management

The run state is managed using a class-based approach with private state and public getters.

```typescript
class FlowRun<TFlow> {
  // Private state
  #state: FlowRunState<TFlow>;
  #steps: Map<string, FlowStep<TFlow, any>> = new Map();
  #eventEmitter: EventEmitter;
  #adapter: PgflowAdapter;
  #unsubscribeCallback: (() => void) | null = null;
  
  constructor(initialState: FlowRunState<TFlow>, adapter: PgflowAdapter) {
    this.#state = initialState;
    this.#adapter = adapter;
    this.#eventEmitter = new EventEmitter();
    
    // Subscribe to updates
  }
  
  // Getters for state properties
  get id(): string { return this.#state.run_id; }
  get status(): 'started' | 'completed' | 'failed' { return this.#state.status; }
  get remainingSteps(): number { return this.#state.remaining_steps; }
  get startedAt(): string { return this.#state.started_at; }
  get completedAt(): string | null { return this.#state.completed_at; }
  get failedAt(): string | null { return this.#state.failed_at; }
  get input(): ExtractFlowInput<TFlow> { return this.#state.input; }
  get output(): ExtractFlowOutput<TFlow> | null { return this.#state.output; }
  get flowSlug(): string { return this.#state.flow_slug; }
  
  // Step access
  step<K extends keyof ExtractFlowSteps<TFlow> & string>(slug: K): FlowStep<TFlow, K> {
    // Return cached or new step instance
  }
  
  // Event subscription
  subscribe(event: string, callback: Function): () => void {
    // Register event listener
  }
  
  // Wait for status
  waitForStatus(status: 'started' | 'completed' | 'failed', options?: WaitOptions): Promise<this> {
    // Return promise that resolves when status is reached
  }
  
  // Cleanup
  unsubscribe(): void {
    // Cleanup subscriptions
  }
}
```

### FlowStep

Represents a single step within a flow run, with its own state and events.

```typescript
class FlowStep<TFlow, K extends keyof ExtractFlowSteps<TFlow> & string> {
  #parent: FlowRun<TFlow>;
  #slug: K;
  
  constructor(parent: FlowRun<TFlow>, slug: K) {
    this.#parent = parent;
    this.#slug = slug;
  }
  
  // Getters that access parent state
  get slug(): K { return this.#slug; }
  get status(): 'created' | 'started' | 'completed' | 'failed' { 
    return this.#parent.#state.steps[this.#slug].status;
  }
  get output(): StepOutput<TFlow, K> | null { 
    return this.#parent.#state.steps[this.#slug].output;
  }
  // Other getters...
  
  // Methods with same API as FlowRun
  subscribe(event: string, callback: Function): () => void {
    // Forward to parent with step-specific filtering
  }
  
  waitForStatus(status: string, options?: WaitOptions): Promise<this> {
    // Implementation
  }
}
```

## State Structure

The internal state structure matches the database model but optimized for client-side usage:

```typescript
interface StepState {
  step_slug: string;
  status: 'created' | 'started' | 'completed' | 'failed';
  remaining_tasks: number;
  remaining_deps: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  output: any | null;
  error_message: string | null;
}

interface FlowRunState<TFlow> {
  // Run data
  run_id: string;
  flow_slug: string;
  status: 'started' | 'completed' | 'failed';
  input: ExtractFlowInput<TFlow>;
  output: ExtractFlowOutput<TFlow> | null;
  remaining_steps: number;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  
  // Steps data (indexed by slug for easy access)
  steps: Record<string, StepState>;
}
```

## Event Handling

### Adapter Event Processing

The adapter listens to Supabase's postgres_changes events for specific tables and transforms them to our internal event model:

```typescript
// Inside SupabaseStandardAdapter
async subscribeToRun(runId: string, onUpdate: (event: FlowEvent) => void): Promise<() => void> {
  // Define event specs for UPDATE and INSERT
  const updateEventSpec = {
    schema: 'pgflow',
    event: 'UPDATE',
    filter: `run_id=eq.${runId}`
  };
  
  const insertEventSpec = {
    schema: 'pgflow',
    event: 'INSERT',
    filter: `run_id=eq.${runId}`
  };

  // Create a Supabase realtime channel
  this.#channel = this.#supabase
    .channel(`flow_run_${runId}`)
    // Runs table UPDATE events
    .on('postgres_changes', 
        { ...updateEventSpec, table: 'runs' }, 
        (payload) => {
          // Convert to internal RunEvent format
          const runEvent: RunEvent = {
            run_id: payload.new.run_id,
            flow_slug: payload.new.flow_slug,
            status: payload.new.status,
            started_at: payload.new.started_at,
            completed_at: payload.new.completed_at,
            failed_at: payload.new.failed_at,
            input: payload.new.input,
            output: payload.new.output,
            remaining_steps: payload.new.remaining_steps
          };
          onUpdate(runEvent);
        })
    
    // Step states UPDATE events
    .on('postgres_changes', 
        { ...updateEventSpec, table: 'step_states' }, 
        (payload) => {
          // Convert to internal StepEvent format
          const stepEvent: StepEvent = {
            run_id: payload.new.run_id,
            flow_slug: payload.new.flow_slug,
            step_slug: payload.new.step_slug,
            status: payload.new.status,
            remaining_tasks: payload.new.remaining_tasks,
            remaining_deps: payload.new.remaining_deps,
            created_at: payload.new.created_at,
            started_at: payload.new.started_at,
            completed_at: payload.new.completed_at,
            failed_at: payload.new.failed_at,
            output: null, // Will be updated from step_tasks data
            error_message: null // Will be updated from step_tasks data
          };
          onUpdate(stepEvent);
        })
    
    // Step tasks UPDATE events - to get output and error_message
    .on('postgres_changes', 
        { ...updateEventSpec, table: 'step_tasks' }, 
        (payload) => {
          // We're primarily interested in output and error_message
          if (payload.new.status === 'completed' || payload.new.status === 'failed') {
            // Create a minimal StepEvent with just the info needed for output
            const stepTaskEvent: StepEvent = {
              run_id: payload.new.run_id,
              flow_slug: payload.new.flow_slug,
              step_slug: payload.new.step_slug,
              status: payload.new.status === 'completed' ? 'completed' : 'failed',
              remaining_tasks: 0,
              remaining_deps: 0,
              created_at: '', // These will be filled from step_states data
              started_at: null,
              completed_at: payload.new.completed_at,
              failed_at: payload.new.failed_at,
              output: payload.new.output,
              error_message: payload.new.error_message
            };
            onUpdate(stepTaskEvent);
          }
        })
    
    // Step tasks INSERT events
    .on('postgres_changes', 
        { ...insertEventSpec, table: 'step_tasks' }, 
        (payload) => {
          // Similar handling as the UPDATE event for step_tasks
          // This is needed for newly created tasks
        })
    .subscribe();
    
  return () => this.unsubscribe();
}
```

### FlowRun Event Processing

Once the adapter transforms the external events, the FlowRun processes them:

```typescript
// Inside FlowRun
#handleEvent(event: FlowEvent): void {
  // Determine event type by checking for step_slug property
  if ('step_slug' in event) {
    // This is a StepEvent
    this.#updateStepState(event);
    
    // Notify step subscribers if this step exists
    const step = this.#steps.get(event.step_slug);
    if (step) {
      step.notifySubscribers('status', event);
    }
  } else {
    // This is a RunEvent
    this.#updateRunState(event);
  }
  
  // Notify run-level subscribers
  this.#eventEmitter.emit('status', event);
  
  // Check if any waitForStatus promises should be resolved
  this.#checkWaitConditions();
}
```

This approach:
1. Listens for specific database events (UPDATE and INSERT) on relevant tables
2. Transforms them to a standardized internal event format
3. Updates FlowRun state and notifies subscribers accordingly

## Open Questions

1. **Error Handling**: How should we handle errors from backend operations? Should we retry automatically?

2. **Disconnection Handling**: What should happen if the realtime connection is lost? Automatic reconnection?

3. **State Persistence**: Should we provide utilities to serialize/deserialize state for client-side persistence?

4. **Reconciliation Strategy**: If there's a conflict between local state and server updates, which should win?

5. **Batching Updates**: Should we batch multiple updates that happen in quick succession?

6. **Authentication**: How do we handle authentication expiration/renewal during long-running flows?

## Implementation Phases

1. **Phase 1**: Standard adapter with basic flow run tracking
2. **Phase 2**: Optimized adapter using direct functions
3. **Phase 3**: React/Vue/Svelte bindings as separate packages

## Testing Strategy

1. **Unit Tests**: Test state management with mock events
2. **Integration Tests**: Test against a real Supabase instance
3. **Mock Adapter**: Create a mock adapter for testing client applications