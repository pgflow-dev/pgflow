# Separation of Concerns in pgflow Architecture

## Overview

pgflow separates concerns across three distinct **levels of abstraction**. Each layer operates at a different conceptual level and solves different classes of problems. This separation isn't about physical architecture or call patterns - it's about keeping different types of thinking and responsibility from bleeding into each other.

## The Three Layers

### Layer 1: Worker - Task Execution Abstraction
**Thinks about**: "Execute this handler with this input, return output or error"
**Abstraction level**: Individual task execution

**Conceptual Focus:**
- Task handler execution
- Input/output transformation  
- Error handling and reporting
- Task-level retry logic

**Conceptual Boundaries:**
- **Doesn't think about**: Where tasks come from, what depends on them, or workflow context
- **Mental model**: "I receive work items and process them independently"
- **Problem domain**: Reliable execution of isolated units of work

### Layer 2: SQL Core - Workflow Orchestration Abstraction  
**Thinks about**: "This step is ready, spawn N tasks, when they complete aggregate results"
**Abstraction level**: DAG execution and step behaviors

**Conceptual Focus:**
- Dependency resolution and step readiness
- step_type execution patterns (single/array/fanout)
- Task spawning and result aggregation
- Transactional workflow state management

**Conceptual Boundaries:**
- **Doesn't think about**: Why steps exist, what DSL syntax created them, or user intent
- **Mental model**: "I have step definitions with clear behaviors, I execute them reliably"
- **Problem domain**: Reliable DAG execution with well-defined step semantics

### Layer 3: DSL - User Intent Abstraction
**Thinks about**: "User wants to fanout over an array, compile this to step definitions"  
**Abstraction level**: User workflow patterns and type-safe composition

**Conceptual Focus:**
- User workflow patterns and intent
- Type-safe method chaining (.step(), .array(), .fanout())
- Ghost step generation for complex patterns
- Compilation from high-level concepts to DAG primitives

**Conceptual Boundaries:**
- **Doesn't think about**: How tasks actually execute or database state management  
- **Mental model**: "I help users express workflows naturally and compile to execution primitives"
- **Problem domain**: Intuitive workflow definition with compile-time safety

## The Key Insight

Each layer **operates at a different conceptual level** and solves different classes of problems:

- **DSL**: "How do I express workflows naturally?"  
- **SQL Core**: "How do I execute DAGs reliably?"
- **Worker**: "How do I run tasks safely?"

They are **conceptually separate** even though they are **physically interdependent**. The separation is about keeping different concerns from bleeding into each other, not about physical isolation.

## Problem Domain Separation

### DSL Domain: Workflow Expression
- Type inference and composition
- User experience and API design  
- Pattern recognition (.fanout(), .array())
- Compile-time validation

### SQL Core Domain: DAG Execution
- Dependency resolution algorithms
- Step state management 
- Task spawning patterns
- Transactional consistency

### Worker Domain: Task Execution  
- Handler invocation
- Error recovery
- Resource management
- Execution isolation

## Example: How Fanout Demonstrates Separation

**Same feature, different concerns at each level:**

### DSL Level Thinking
"User wants to send emails to multiple users. They have an array of users and want parallel processing. I'll provide `.array()` and `.fanout()` methods that are intuitive and type-safe."

### SQL Core Level Thinking  
"I have two steps: one with step_type='array' (validate array output) and one with step_type='fanout' (spawn N tasks). I don't care why they exist or what they represent to users."

### Worker Level Thinking
"I received a task with handler function and input data. Execute the handler, return the result. I don't care if this is part of a fanout or what other tasks exist."

**Key Point**: Each layer solves the fanout problem at its own abstraction level without needing to understand the others' concerns.

## Benefits of Abstraction Separation

### 1. Cognitive Load Management
Each layer has a bounded problem space:
- Worker engineers think about task execution reliability
- SQL Core engineers think about DAG orchestration algorithms  
- DSL engineers think about user experience and type systems

### 2. Concern Isolation
Changes in one abstraction level don't leak to others:
- New DSL syntax doesn't affect SQL Core execution logic
- New step_type behaviors don't change DSL compilation patterns
- Worker improvements don't impact workflow orchestration

### 3. Composability Through Primitives
Lower abstraction levels provide reliable primitives for higher levels:
- SQL Core's step_type behaviors are predictable building blocks
- DSL can compose complex patterns from simple execution primitives
- Each level builds on well-defined semantics from below

### 4. Independent Evolution
Each layer can advance without coupling:
- DSL can add new user-facing features using existing SQL Core primitives
- SQL Core can optimize execution without breaking DSL compilation
- Worker can improve performance without affecting workflow logic

### 5. Testing and Reasoning
Each abstraction level can be validated in isolation:
- Unit test SQL Core step behaviors independently of DSL syntax
- Test DSL compilation without running actual workflows
- Validate Worker execution without workflow context

## Architectural Principles

### 1. Bounded Problem Domains
Each layer focuses on one class of problems:
- **Worker**: Task execution reliability and isolation
- **SQL Core**: DAG orchestration and state consistency  
- **DSL**: User experience and workflow expression

### 2. Abstraction Level Purity
Each layer operates consistently at its abstraction level:
- **Worker**: Always thinks in terms of individual tasks
- **SQL Core**: Always thinks in terms of steps and dependencies
- **DSL**: Always thinks in terms of user intent and patterns

### 3. Semantic Guarantees
Lower levels provide predictable behavior contracts:
- `step_type='array'` always validates array outputs
- `step_type='fanout'` always spawns N tasks from dependency array
- Workers always execute handlers independently

### 4. No Abstraction Leakage
Higher levels never need to understand lower level implementation details:
- DSL doesn't know about database schemas or task queues
- SQL Core doesn't know about TypeScript types or method chaining
- Worker doesn't know about workflows or step relationships

This separation ensures that pgflow remains maintainable and extensible by keeping different types of complexity isolated in appropriate layers.