---
title: Explain in a Simple Way
draft: true
---

# PGFlow Workflow Engine Architecture

## Overview

PGFlow is a workflow engine designed to manage and execute complex workflows within a PostgreSQL database. It allows you to define flows, steps, and dependencies, and handles the execution of these steps in a controlled manner.

## Core Components

### 1. Flows

- **Definition**: A flow is a collection of steps that define a specific process or workflow.
- **Storage**: Flows are stored in the `pgflow.flows` table, identified by a unique `flow_slug`.

### 2. Steps

- **Definition**: Steps are individual steps or actions within a flow.
- **Storage**: Steps are stored in the `pgflow.steps` table, each associated with a `flow_slug` and identified by a `step_slug`.

### 3. Dependencies

- **Definition**: Dependencies define the order in which steps should be executed. A step can only start after its dependencies are completed.
- **Storage**: Dependencies are stored in the `pgflow.deps` table, linking `from_step_slug` to `to_step_slug`.

## Runtime State

### 1. Runs

- **Definition**: A run is an instance of a flow execution.
- **Storage**: Runs are tracked in the `pgflow.runs` table, identified by a `run_id`.

### 2. Step States

- **Definition**: Step states track the execution status of each step within a run.
- **Storage**: Step states are stored in the `pgflow.step_states` table, with status values like 'pending', 'failed', or 'completed'.

## Execution Flow

1. **Start a Flow**: When a flow is started, a new run is created, and all root steps (steps without dependencies) are initiated.

2. **Step Execution**: Each step is executed based on its dependencies. Once a step is completed, its dependents are checked and started if all their dependencies are met.

3. **Job Enqueueing**: Steps are executed by enqueuing jobs, which can be processed by external systems or functions.

## Why This Architecture?

- **Modularity**: By separating flows, steps, and dependencies, PGFlow allows for flexible and reusable workflow definitions.
- **Scalability**: The architecture supports complex workflows with multiple dependencies, making it suitable for large-scale applications.
- **Database-Centric**: Leveraging PostgreSQL for storage and execution ensures data integrity and consistency.

## Conclusion

PGFlow provides a robust framework for managing workflows directly within a PostgreSQL database. Its architecture is designed to handle complex dependencies and ensure reliable execution of steps.
