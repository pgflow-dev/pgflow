# SDK Phase 1: Core Interfaces and Database Modifications

Phase 1 establishes the foundation for our SDK by implementing the required SQL functionality and core TypeScript interfaces. This phase focuses on the database communication layer that everything else will build upon.

## Objectives

1. Implement SQL broadcast functions required for real-time communication
2. Define core interface hierarchy in TypeScript
3. Implement SQL client connector 

## SQL Modifications

Add broadcast events to existing PostgreSQL functions:

1. **Create new SQL functions:**
   - `pgflow.start_flow_with_states` - Return complete initial state snapshot
   - `pgflow.get_run_with_states` - Fetch current state for reconnection

2. **Modify existing functions to emit broadcast events:**
   - `start_flow.sql` - Add `run:started` event
   - `start_ready_steps.sql` - Add `<step_slug>:started` event
   - `complete_task.sql` - Add `<step_slug>:completed` event 
   - `fail_task.sql` - Add `<step_slug>:failed` and potentially `run:failed` events
   - `maybe_complete_run.sql` - Add `run:completed` event

3. **Add supporting index:**
   - Create index on step_states(run_id) for efficient queries

## TypeScript Interface Hierarchy

1. **Interface Segregation:**
   - `IFlowStarter` (core) - For starting flows
   - `ITaskProcessor` (core) - For task processing operations
   - `IFlowRealtime` (sdk) - For real-time updates
   - `IFlowClient` (sdk) - Combines IFlowStarter and IFlowRealtime

2. **Event Types:**
   - Define FlowRunEvents and StepEvents generic types
   - Create broadcast event payload types

## Initial Package Setup

1. Create package structure with proper dependencies
2. Configure TypeScript and build process
3. Add required dependencies (nanoevents, uuid)
4. Setup exports and entry points

## Deliverables

1. SQL functions with broadcast capability
2. Core TypeScript interfaces and types
3. Initial package structure and configuration

This phase establishes the foundational components that all subsequent SDK functionality will build upon.