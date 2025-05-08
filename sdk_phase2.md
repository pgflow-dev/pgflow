# SDK Phase 2: Broadcast Adapter Implementation

Phase 2 builds upon the foundation established in Phase 1 by implementing the real-time communication layer. This phase focuses on creating the SupabaseBroadcastAdapter to handle communication between the database and client.

## Objectives

1. Implement the SupabaseBroadcastAdapter class
2. Create robust subscription and event handling
3. Establish connection management and error handling

## SupabaseBroadcastAdapter Implementation

1. **Core Functionality:**

   - Implement the IFlowRealtime interface
   - Create methods for fetching flow definitions and run states
   - Set up event subscription and callback management

2. **Subscription Management:**

   - Implement channel creation and subscription
   - Create channel tracking and cleanup mechanisms
   - Handle channel events and callback distribution

3. **Event Processing:**
   - Parse and route incoming events
   - Implement event filtering and validation
   - Handle reconnection scenarios
   - Design for possible future throughput challenges (prepare for channel sharding if needed)

## Connection Management

1. **Channel Lifecycle:**

   - Implement channel creation and initialization
   - Create subscription tracking and management
   - Handle channel teardown and resource cleanup

2. **Error Handling:**
   - Implement reconnection logic
   - Add error event propagation
   - Create robust error recovery mechanisms

## Event Callback System

1. **Callback Registration:**

   - Implement callback registration and storage
   - Create callback removal functionality
   - Add safeguards for callback invocation

2. **Event Routing:**
   - Create event parsing and routing logic
   - Implement event type matching
   - Add payload validation and normalization

## Deliverables

1. Complete SupabaseBroadcastAdapter implementation
2. Robust event subscription and management system
3. Connection lifecycle management
4. Documentation for adapter usage
5. Tests to ensure incoming payloads match TypeScript event type definitions (field names and casing must match exactly, especially for error_message field)
6. Helper utilities for event parsing with test coverage
7. Initial validation that the adapter works with existing edge-worker code

This phase provides the critical real-time communication layer that enables the client to receive and process events from the database, setting the stage for the client-side state management implemented in Phase 3.
