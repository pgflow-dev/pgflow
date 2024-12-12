# Code Conventions Guide

## Naming Conventions
1. Edge function names using camelCase
   - `startStepTask`
   - `completeStepTask`
   - `executeTask`

2. Type names using PascalCase
   - `EdgeFnInput`
   - `StepDefinition`
   - `Flow`

3. Variable names using camelCase with semantic prefixes
   - `p_` for parameters (`p_run_id`)
   - `v_` for variables (`v_task`)
   - `new_` for new records (`new_run`)

## Architecture & Abstractions
1. Flow management pattern
   - Core `Flow` class with step definitions
   - Step handlers with dependencies injection
   - Input/Output type enforcement

2. Task execution pattern
   - Start task state tracking
   - Execute task logic
   - Complete/Fail task handling

3. Database schema organization  
   - Core definition tables (`flows`, `steps`, `deps`)
   - Runtime state tables (`runs`, `step_states`, `step_tasks`)
   - Supporting schemas (`pgflow_locks`, `pgflow_tests`)

## Code Structure 
1. Function composition
   - Small single-purpose functions
   - Clear function inputs/outputs
   - Chained function execution

2. Error handling
   - Explicit error types
   - Error propagation
   - Status tracking

3. Type safety
   - Generic type constraints
   - Type guards
   - Interface definitions
