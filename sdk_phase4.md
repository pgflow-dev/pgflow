# SDK Phase 4: PgflowClient Class and Resource Management

Phase 4 builds upon the state management components from Phase 3 to implement the main PgflowClient class, which serves as the primary entry point for the SDK. This phase focuses on flow creation, resource management, and lifecycle handling.

## Objectives

1. Implement the main PgflowClient class
2. Create robust resource management and cleanup
3. Add automatic reference tracking and disposal
4. Implement flow creation with pre-subscription pattern

## PgflowClient Implementation

1. **Core Functionality:**
   - Implement IFlowClient interface
   - Create flow starting mechanism with pre-subscription
   - Add resource tracking and management

2. **Flow Creation:**
   - Implement startFlow method with type-safety
   - Create UUID generation with optional override
   - Add flow subscription and initialization sequence
   - Implement proper error handling for flow creation

3. **Resource Management:**
   - Create internal flow run tracking
   - Implement automatic cleanup detection
   - Add explicit disposal methods

## Pre-Subscription Pattern

1. **Race Condition Prevention:**
   - Generate client-side UUID if not provided
   - Set up subscriptions before starting the flow
   - Implement proper subscription sequencing

2. **Initial State Handling:**
   - Fetch flow definition before starting
   - Initialize FlowRun with flow metadata
   - Update with complete state snapshot after starting

## Resource Cleanup

1. **Automatic Cleanup:**
   - Dispose resources ONLY when BOTH conditions are met: (1) no remaining event listeners AND (2) terminal status reached ('completed' or 'failed')
   - Implement reference counting mechanism using WeakMap or internal tracking counters
   - Add lifecycle hooks for proper cleanup scheduling

2. **Manual Cleanup:**
   - Add specific run disposal method
   - Implement global cleanup method
   - Create safeguards for already disposed resources

3. **Garbage Collection:**
   - Implement weak references for inactive flows
   - Add periodic cleanup of inactive resources
   - Create safeguards against memory leaks

## Deliverables

1. Complete PgflowClient class implementation
2. Robust resource management and cleanup
3. Race condition prevention with pre-subscription
4. Type-safe flow creation and management

This phase completes the core functionality of the SDK, providing a comprehensive client for starting, managing, and monitoring flow runs. The next phase will focus on testing, documentation, and additional type-safety enhancements.