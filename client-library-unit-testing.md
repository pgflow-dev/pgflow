# Unit Testing Strategy for pgflow Client Library

## Core Testing Philosophy

Unit testing the client library is completely feasible and gives high value for minimal effort. The approach outlined below follows the project's MVP philosophy of achieving 80% value with 20% effort.

## Core Testable Components

- `FlowRun` - State machine for runs
- `FlowStep` - State machine for steps
- `SupabaseBroadcastAdapter` - Event handling
- `PgflowClient` - Main client API

## Mocking Approach

### Creating a Supabase Mock

```typescript
// tests/mocks/supabase.ts
import { vi } from 'vitest'
import { createNanoEvents } from 'nanoevents' // Simple event emitter

export function createMockSupabaseClient() {
  const emitter = createNanoEvents()
  const channels = new Map()
  
  // Mock channel creation
  const createChannel = (name) => {
    const channel = {
      on: vi.fn((event, callback) => {
        const unsubscribe = emitter.on(`${name}:${event}`, callback)
        return unsubscribe
      }),
      subscribe: vi.fn((callback) => {
        const unsubscribe = emitter.on(`${name}`, callback)
        return { unsubscribe }
      }),
      unsubscribe: vi.fn(),
      
      // Test helper to simulate events
      _emit: (event, payload) => {
        emitter.emit(`${name}:${event}`, payload)
      }
    }
    
    channels.set(name, channel)
    return channel
  }
  
  // Create the mock client
  const mockClient = {
    channel: vi.fn((name) => {
      if (!channels.has(name)) {
        return createChannel(name)
      }
      return channels.get(name)
    }),
    
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(cb => Promise.resolve(cb({ data: null, error: null })))
    })),
    
    // Test helpers
    _channels: channels,
    _simulateEvent: (channelName, eventName, payload) => {
      const channel = channels.get(channelName)
      if (channel) {
        channel._emit(eventName, payload)
      }
    }
  }
  
  return mockClient
}
```

## Example Test Scenarios

### 1. Testing FlowRun State Machine

```typescript
// tests/unit/FlowRun.test.ts
import { FlowRun } from '../../src/lib/FlowRun'
import { FlowRunStatus } from '../../src/lib/types'
import { describe, it, expect, vi } from 'vitest'

describe('FlowRun', () => {
  it('should respect status precedence', () => {
    // Create a run with STARTED status
    const run = new FlowRun({
      run_id: '123',
      flow_slug: 'test-flow',
      status: FlowRunStatus.Started,
      step_states: [],
      started_at: new Date().toISOString()
    })
    
    // Try to update with a lower precedence status (QUEUED)
    const updated = run.updateState({ 
      run_id: '123', 
      status: FlowRunStatus.Queued 
    })
    
    // Verify the update was ignored
    expect(updated).toBe(false)
    expect(run.status).toBe(FlowRunStatus.Started)
  })
  
  it('should emit events when status changes', () => {
    const run = new FlowRun({
      run_id: '123',
      flow_slug: 'test-flow',
      status: FlowRunStatus.Queued,
      step_states: []
    })
    
    const listener = vi.fn()
    run.onStatusChange(listener)
    
    // Update to higher status
    run.updateState({ 
      run_id: '123', 
      status: FlowRunStatus.Started 
    })
    
    expect(listener).toHaveBeenCalledWith(
      FlowRunStatus.Started,
      FlowRunStatus.Queued
    )
  })
  
  it('should resolve waitForStatus when status is reached', async () => {
    const run = new FlowRun({
      run_id: '123',
      flow_slug: 'test-flow',
      status: FlowRunStatus.Queued,
      step_states: []
    })
    
    // Start waiting for completion
    const promise = run.waitForStatus(FlowRunStatus.Completed, { timeout: 1000 })
    
    // Update the status
    setTimeout(() => {
      run.updateState({ 
        run_id: '123', 
        status: FlowRunStatus.Completed 
      })
    }, 10)
    
    await expect(promise).resolves.toBe(true)
  })
})
```

### 2. Testing PgflowClient

```typescript
// tests/unit/PgflowClient.test.ts
import { PgflowClient } from '../../src/lib/PgflowClient'
import { FlowRunStatus } from '../../src/lib/types'
import { createMockSupabaseClient } from '../mocks/supabase'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('PgflowClient', () => {
  let mockSupabase
  let client
  
  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    client = new PgflowClient({ supabaseClient: mockSupabase })
  })
  
  it('should start a flow and set up realtime subscription', async () => {
    // Mock the RPC response
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        run_id: '123',
        flow_slug: 'test-flow',
        status: FlowRunStatus.Queued,
        step_states: []
      },
      error: null
    })
    
    // Start a flow
    const run = await client.startFlow('test-flow', { foo: 'bar' })
    
    // Verify RPC was called correctly
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'pgflow.start_flow_with_states',
      { flow_slug: 'test-flow', input: { foo: 'bar' } }
    )
    
    // Verify channel subscription
    expect(mockSupabase.channel).toHaveBeenCalledWith('pgflow:run:123')
    
    // Verify run object
    expect(run.run_id).toBe('123')
    expect(run.status).toBe(FlowRunStatus.Queued)
    
    // Simulate a realtime event
    const statusListener = vi.fn()
    run.onStatusChange(statusListener)
    
    mockSupabase._simulateEvent(
      'pgflow:run:123',
      'run:status',
      { run_id: '123', status: FlowRunStatus.Started }
    )
    
    // Verify the run was updated
    expect(run.status).toBe(FlowRunStatus.Started)
    expect(statusListener).toHaveBeenCalled()
  })
  
  it('should properly handle reconnection', async () => {
    // Test implementation for reconnection logic
  })
})
```

### 3. Testing SupabaseBroadcastAdapter

```typescript
// tests/unit/SupabaseBroadcastAdapter.test.ts
import { SupabaseBroadcastAdapter } from '../../src/lib/SupabaseBroadcastAdapter'
import { createMockSupabaseClient } from '../mocks/supabase'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('SupabaseBroadcastAdapter', () => {
  let mockSupabase
  let adapter
  
  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    adapter = new SupabaseBroadcastAdapter(mockSupabase)
  })
  
  it('should route messages to appropriate handlers', () => {
    const runHandler = vi.fn()
    const stepHandler = vi.fn()
    
    adapter.subscribeToRun('123', runHandler)
    adapter.subscribeToStep('123', 'step1', stepHandler)
    
    // Simulate run event
    mockSupabase._simulateEvent(
      'pgflow:run:123',
      'run:status',
      { run_id: '123', status: 'started' }
    )
    
    // Simulate step event
    mockSupabase._simulateEvent(
      'pgflow:step:123:step1',
      'step:status',
      { step_slug: 'step1', status: 'started' }
    )
    
    expect(runHandler).toHaveBeenCalledWith({ 
      event: 'run:status', 
      payload: { run_id: '123', status: 'started' } 
    })
    
    expect(stepHandler).toHaveBeenCalledWith({
      event: 'step:status',
      payload: { step_slug: 'step1', status: 'started' }
    })
  })
})
```

## Key Testing Areas to Focus On

1. **State Machines (70% of value)**
   - Status transitions and precedence rules
   - Event emission
   - Wait promises (resolve, timeout, abort)

2. **Event Routing (20% of value)**
   - Correct subscription to channels
   - Event routing to appropriate handlers
   - Auto-cleanup of subscriptions

3. **Error Handling (10% of value)**
   - Graceful handling of errors from Supabase
   - Reconnection logic

## Practical Implementation Tips

1. **Keep mocks simple**
   - Focus on the interfaces, not implementation details
   - Use nanoevents (only 1KB) for event simulation

2. **Test in isolation first**
   - Test FlowRun and FlowStep independently
   - Then test PgflowClient with mock adapters

3. **Leverage Vitest spies**
   - Track method calls and event handlers
   - Verify subscription lifecycle

4. **Simulate realistic scenarios**
   - Connection drop and reconnection
   - Out-of-order event delivery
   - Race conditions with concurrent updates

## Conclusion

Unit testing the client library is not only possible but gives you the highest ROI. By focusing on the state machines and event routing, you can verify the most critical aspects of the library's behavior with minimal setup complexity. This approach aligns perfectly with the project's MVP philosophy.