# SDK Phase 1: Core Interfaces and Database Modifications

Phase 1 establishes the foundation for our SDK by implementing the required SQL functionality and core TypeScript interfaces. This phase focuses on the database communication layer that everything else will build upon.

## Objectives

1. Implement SQL broadcast functions required for real-time communication
2. Define core interface hierarchy in TypeScript
3. Implement SQL client connector 

## SQL Modifications

Add broadcast events to existing PostgreSQL functions:

1. **Create new SQL functions:**
   - `pgflow.start_flow_with_states(flow_slug TEXT, input JSONB, run_id UUID DEFAULT NULL)` - Return complete initial state snapshot as TABLE(run, steps[])
   - `pgflow.get_run_with_states(run_id UUID)` - Fetch current state for reconnection

2. **Modify existing functions to emit broadcast events:**
   - `start_flow.sql` - Add optional `run_id` parameter and `run:started` event with complete payload (including remaining_steps)
   - `start_ready_steps.sql` - Add `<step_slug>:started` event with complete payload (including remaining_tasks, remaining_deps)
   - `complete_task.sql` - Add `<step_slug>:completed` event with complete payload
   - `fail_task.sql` - Add `<step_slug>:failed` and potentially `run:failed` events with complete payload
   - `maybe_complete_run.sql` - Add `run:completed` event with complete payload

3. **Add supporting index:**
   - Create index on step_states(run_id) for efficient queries

## TypeScript Interface Hierarchy

1. **Interface Segregation:**
   - `IFlowStarter` (core) - For starting flows with `startFlow<TFlow>(flow_slug, input, run_id?: string)`
   - `ITaskProcessor` (core) - For task processing operations
   - `IFlowRealtime` (sdk) - For real-time updates
   - `IFlowClient` (sdk) - Combines IFlowStarter and IFlowRealtime
   - Keep `IPgflowClient` as an alias for backward compatibility (`IFlowStarter & ITaskProcessor`)

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
4. Refactor existing `PgflowSqlClient` to implement the new small interfaces (`IFlowStarter` and `ITaskProcessor`) while maintaining backward compatibility
5. Keep existing `IPgflowClient` as an alias interface for backward compatibility to avoid breaking edge-worker code
6. Complete event payload definitions that match SQL broadcast fields exactly, ensuring field names and casing match between SQL and TypeScript

This phase establishes the foundational components that all subsequent SDK functionality will build upon.