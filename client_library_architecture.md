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

  async startFlow<TFlow>(
    flowSlug: string,
    input: ExtractFlowInput<TFlow>
  ): Promise<FlowRun<TFlow>> {
    // 1. Start the flow via adapter (which handles the array return)
    const runId = await this.#adapter.startFlow<TFlow>(flowSlug, input);
    
    // 2. Fetch initial state - do this BEFORE subscribing to avoid event buffering
    const initialState = await this.#adapter.fetchRunState<TFlow>(runId);
    
    // 3. Create the FlowRun instance which will set up its own subscriptions
    return new FlowRun<TFlow>(initialState, this.#adapter);
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
  subscribeToRun(
    runId: string,
    onUpdate: (event: FlowEvent) => void
  ): Promise<() => void>;

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
    // Call the RPC function that returns SETOF pgflow.runs
    const { data, error } = await this.#supabase
      .rpc('pgflow.start_flow', { 
        flow_slug: flowSlug, 
        input 
      });
      
    if (error) throw error;
    
    // Handle SETOF return - data will be an array
    if (!data || data.length === 0) {
      throw new Error('Flow start did not return a run');
    }
    
    // Extract the run_id from the first item
    return data[0].run_id;
  }

  async fetchRunState<TFlow>(runId: string): Promise<FlowRunState<TFlow>> {
    // Implementation using supabase select with joins
  }

  async subscribeToRun(
    runId: string,
    onUpdate: (event: any) => void
  ): Promise<() => void> {
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

    // First fetch state, then subscribe to updates (avoids race conditions)
    this.#setupSubscription();
    
    // Set up auto-cleanup for terminal states
    this.#setupAutoCleanup();
  }

  // Getters for state properties
  get runId(): string {
    return this.#state.run_id;
  }
  get status(): 'started' | 'completed' | 'failed' {
    return this.#state.status;
  }
  get remainingSteps(): number {
    return this.#state.remaining_steps;
  }
  get startedAt(): string {
    return this.#state.started_at;
  }
  get completedAt(): string | null {
    return this.#state.completed_at;
  }
  get failedAt(): string | null {
    return this.#state.failed_at;
  }
  get input(): ExtractFlowInput<TFlow> {
    return this.#state.input;
  }
  get output(): ExtractFlowOutput<TFlow> | null {
    return this.#state.output;
  }
  get flowSlug(): string {
    return this.#state.flow_slug;
  }

  // Step access
  step<K extends keyof ExtractFlowSteps<TFlow> & string>(
    slug: K
  ): FlowStep<TFlow, K> {
    // Return cached or new step instance
  }

  // Event subscription
  subscribe(event: string, callback: Function): () => void {
    // Register event listener
  }

  // Wait for status
  waitForStatus(
    status: 'started' | 'completed' | 'failed',
    options?: WaitOptions
  ): Promise<this> {
    // Return promise that resolves when status is reached
  }

  // Lifecycle management methods
  dispose(): void {
    // Cleanup subscriptions, event listeners, and cached step instances
    this.unsubscribe();
    this.#steps.clear();
    this.#eventEmitter.removeAllListeners();
  }
  
  unsubscribe(): void {
    // Cleanup just the realtime subscriptions
    if (this.#unsubscribeCallback) {
      this.#unsubscribeCallback();
      this.#unsubscribeCallback = null;
    }
  }
  
  // Auto-cleanup will be triggered when run reaches terminal state
  #setupAutoCleanup(): void {
    this.subscribe((event) => {
      // Auto-dispose when run reaches a terminal state
      if (event.status === 'completed' || event.status === 'failed') {
        // Delay dispose slightly to allow any pending waitForStatus promises to resolve
        setTimeout(() => this.dispose(), 100);
      }
    });
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
  get slug(): K {
    return this.#slug;
  }
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

    // Notify ONLY the corresponding step's subscribers
    const step = this.#steps.get(event.step_slug);
    if (step) {
      step.notifySubscribers(event);
    }
    
    // NOTE: We do NOT emit step events to flow-level subscribers
    // flowRun.subscribe() only receives run events, not step events
  } else {
    // This is a RunEvent - update state and notify flow-level subscribers
    this.#updateRunState(event);
    this.#eventEmitter.emit(event);
  }

  // Check if any waitForStatus promises should be resolved
  this.#checkWaitConditions();
}
```

This approach:

1. Listens for specific database events (UPDATE and INSERT) on relevant tables
2. Transforms them to a standardized internal event format
3. Updates FlowRun state 
4. Routes events to the appropriate subscribers:
   - Run events → only flowRun subscribers
   - Step events → only the specific step's subscribers

This creates a clean separation of concerns where:
- `flowRun.subscribe()` only receives run-level events
- `flowStep.subscribe()` only receives events for that specific step
- Users must explicitly subscribe to each step they want to track

### Handling Out-of-Order Events

Since network conditions could cause postgres_changes events to arrive out of order, the state management includes basic safeguards:

```typescript
// Example: Prevent invalid state transitions using status precedence
private updateStepState(event: StepEvent): void {
  const currentState = this.#state.steps[event.step_slug];
  
  // Define clear status precedence
  const statusPrecedence = { 
    'created': 0, 
    'started': 1, 
    'completed': 2, 
    'failed': 2 
  };
  
  // Only apply updates that move forward or stay at same level in the state machine
  // This prevents "going backwards" if events arrive out of order
  if (statusPrecedence[event.status] < statusPrecedence[currentState.status]) {
    // Ignore events that would downgrade the status
    return;
  }
  
  // Apply the update if it's valid
  this.#state.steps[event.step_slug] = {
    ...currentState,
    ...event
  };
}
```

This approach ensures state consistency even if events arrive in an unexpected order.

## Open Questions - MVP Approach

For our MVP, we'll take a thin, simple approach to these questions:

1. **Error Handling**:

   - Use a simple approach of throwing errors directly for async operations
   - Let consumers use try/catch patterns they're already familiar with
   - For event-based errors, emit error events that can be subscribed to
   - No automatic retries in the MVP - leave this to consumers

2. **Disconnection Handling**:

   - Rely on Supabase's built-in reconnection capabilities
   - Provide a connection status event that consumers can subscribe to
   - No additional reconnection logic in our library

3. **State Persistence**:

   - MVP will not include state persistence utilities
   - State exists only in memory during the session
   - Consumers can access state via getters and implement their own persistence

4. **Reconciliation Strategy**:

   - Server is always the source of truth - client state is just a cache
   - Always apply server updates, overwriting local state
   - No conflict resolution needed with this approach

5. **Batching Updates**:

   - No batching in MVP - apply updates as they arrive
   - Optimizing update frequency can be considered for future versions

6. **Authentication**:
   - Authentication is handled by the Supabase client, not our library
   - Rely on Supabase's token refresh mechanism
   - Surface authentication errors to consumers

This approach keeps our client library thin and focused while giving consumers the flexibility to implement more complex behaviors if needed.

## Simplifications for MVP

To keep the MVP focused but powerful, we will:

1. **Skip Optimized Adapter**: Focus only on the standard adapter using postgres_changes
2. **Minimal Event Model**: Keep the event model simple while ensuring all necessary status updates
3. **Simple Wait Conditions**: Basic promise-based waiting with timeout support
4. **Direct Error Handling**: Use throws/try-catch instead of complex error objects
5. **Step Task Output Mapping**: Have the adapter merge step_tasks output into step events for simplicity
6. **Single-Task Support**: Initially design for the current one-task-per-step model, while structuring the code to allow future extension to multi-task steps

While simplifying, we will maintain these essential features:

- **Full DSL Type Integration**: Complete type safety with DSL from day one
- **Rich Step Access API**: Ability to access steps and their outputs in a type-safe way
- **Efficient State Management**: Properly normalized internal state representation 
- **Memory Management**: Auto-cleanup of resources when runs reach terminal states

## Error Handling Plan

Based on our review of the core PostgreSQL schema and flow execution logic, we need robust error handling:

1. **Run & Step Failure Detection**:
   - Track the 'failed' status in both run and step states
   - When a step fails, emit appropriate events to subscribers
   - Maintain step_tasks error_message in our step events

2. **waitForStatus Behavior**:
   - If waiting for 'completed' but status becomes 'failed', the promise should reject
   - Include the error_message in the rejection reason
   - Example: `await flowRun.waitForStatus('completed')` should reject if the flow fails

3. **Step Task Error Handling**:
   - Extract error_message from step_tasks and include it in step events
   - Make error_message available through the step.error_message getter
   - Ensure step_tasks events properly update the corresponding step_state

## Implementation Phases

1. **Phase 1 (MVP)**: Standard adapter with full type integration and core features
2. **Future Phases**: Consider optimized adapters, framework bindings, and advanced features based on user feedback

## Testing Strategy

1. **Type Tests**: Ensure type safety with TypeScript's type checking
2. **Unit Tests**: Test core state management and event handling logic
3. **Manual Testing**: Test against Supabase with real flows during initial development
