# pgflow

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An embeddable workflow engine built on PostgreSQL and task queues, designed for Supabase developers.

---

**🚀 Try pgflow Cloud for free!**

Don't want to manage the setup? Get started instantly with [pgflow Cloud](https://pgflowcloud.example.com), our fully-managed pgflow hosting solution. Seamless integration, auto-scaling, and 24/7 support.

---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Option 1: Supabase SQL Editor](#option-1-supabase-sql-editor)
  - [Option 2: SQL Script](#option-2-sql-script)
- [Getting Started](#getting-started)
  - [Defining Workflows](#defining-workflows)
  - [Running Workflows](#running-workflows)
  - [Implementing Step Logic](#implementing-step-logic)
- [How It Works](#how-it-works)
- [Example](#example)
- [Integrations](#integrations)
- [Contributing](#contributing)
- [License](#license)

## Introduction

**pgflow** is a lightweight, PostgreSQL-based workflow engine that allows you to define, execute, and manage complex workflows directly within your database. Tailored for Supabase developers, pgflow leverages PostgreSQL's powerful features to orchestrate asynchronous tasks seamlessly.

## Features

- **Database-Native Workflows**: Define workflows using SQL within PostgreSQL.
- **Asynchronous Execution**: Integrate with task queues for non-blocking operations.
- **Dependency Management**: Handle complex step dependencies with ease.
- **Supabase Integration**: Optimized for Supabase projects.
- **Extensible Schema**: Customize and extend as per your application's needs.

## Installation

### Prerequisites

- PostgreSQL 12 or higher
- Supabase project (optional but recommended)
- Access to execute SQL scripts

### Option 1: Supabase SQL Editor

1. **Access SQL Editor**: Log in to your Supabase project and navigate to the SQL Editor.
2. **Execute Script**:
   - Copy the pgflow schema and functions (provided below or in the [`pgflow.sql`](#pgflow-sql-script) section).
   - Paste into the SQL editor.
   - Run the script to set up pgflow in your database.

### Option 2: SQL Script

1. **Download Script**: Save the following SQL code into a file named `pgflow.sql`.

   ```sql
   -- pgflow schema and functions
   -- (Full SQL script provided in the next section)
   ```

2. **Execute Script**: Run the script using psql or your preferred PostgreSQL client.

   ```bash
   psql -U your_user -d your_database -f pgflow.sql
   ```

## Getting Started

### Defining Workflows

Workflows consist of steps and dependencies.

#### 1. Create a Workflow

```sql
INSERT INTO pgflow.workflows (slug) VALUES ('my_workflow');
```

#### 2. Define Steps

```sql
INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
  ('my_workflow', 'step_one'),
  ('my_workflow', 'step_two'),
  ('my_workflow', 'step_three');
```

#### 3. Set Dependencies

```sql
-- step_two depends on step_one
INSERT INTO pgflow.deps (workflow_slug, from_step_slug, to_step_slug) VALUES
  ('my_workflow', 'step_one', 'step_two');

-- step_three depends on step_two
INSERT INTO pgflow.deps (workflow_slug, from_step_slug, to_step_slug) VALUES
  ('my_workflow', 'step_two', 'step_three');
```

### Running Workflows

Start a workflow execution (a run) with an initial payload.

```sql
SELECT * FROM pgflow.run_workflow('my_workflow', '{"key": "value"}');
```

This inserts a new run into `pgflow.runs` and starts root steps automatically.

### Implementing Step Logic

Steps are executed via a task queue. Implement workers to process tasks.

#### Starting a Step

```sql
SELECT * FROM pgflow.start_step('run_id', 'step_slug');
```

#### Succeeding a Step

After processing, mark the step as completed.

```sql
SELECT * FROM pgflow.complete_step('run_id', 'step_slug', '{"result": "data"}');
```

#### Checking for Unmet Dependencies

Use `pgflow.has_unmet_deps` to check if a step's dependencies are completed.

```sql
SELECT pgflow.has_unmet_deps('run_id', 'step_slug');
```

## How It Works

- **Workflows**: Defined in `pgflow.workflows` with a unique slug.
- **Steps**: Defined in `pgflow.steps`, associated with workflows.
- **Dependencies**: Managed in `pgflow.deps` to enforce execution order.
- **Runs**: Instances of workflow executions in `pgflow.runs`.
- **Step States**: Execution state of each step tracked in `pgflow.step_states`.

## Example

### Scenario: Email Campaign Workflow

#### Define Workflow

```sql
INSERT INTO pgflow.workflows (slug) VALUES ('email_campaign');
```

#### Define Steps

```sql
INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
  ('email_campaign', 'prepare_list'),
  ('email_campaign', 'send_emails'),
  ('email_campaign', 'generate_report');
```

#### Set Dependencies

```sql
-- 'send_emails' depends on 'prepare_list'
INSERT INTO pgflow.deps (workflow_slug, from_step_slug, to_step_slug) VALUES
  ('email_campaign', 'prepare_list', 'send_emails');

-- 'generate_report' depends on 'send_emails'
INSERT INTO pgflow.deps (workflow_slug, from_step_slug, to_step_slug) VALUES
  ('email_campaign', 'send_emails', 'generate_report');
```

#### Run Workflow

```sql
SELECT * FROM pgflow.run_workflow('email_campaign', '{"campaign_id": 123}');
```

#### Process Steps

Your task queue (e.g., pgqueuer) picks up tasks and executes them.

##### Worker Logic Example

1. **Fetch Task**: Worker fetches task from the queue.
2. **Execute Step Logic**: Based on `step_slug`.
3. **Mark Step as Succeeded**:

   ```sql
   SELECT * FROM pgflow.complete_step('run_id', 'step_slug', '{"success": true}');
   ```

4. **Trigger Next Steps**: Upon success, dependent steps are automatically started if all dependencies are met.

## Integrations

### Supabase

- **Edge Functions**: Use Supabase Edge Functions to trigger workflows.
- **Real-time Monitoring**: Leverage Supabase's real-time features to track workflow progress.
- **Row-level Security**: Secure your workflow data with RLS policies.

### Task Queues

- **pgqueuer**: Native PostgreSQL task queue for seamless integration.
- **External Queues**: Use external systems like RabbitMQ or Redis with appropriate connectors.

## Contributing

We welcome contributions!

- **Report Issues**: Submit issues for bugs or feature requests.
- **Pull Requests**: Fork the repository and submit pull requests.
- **Discussions**: Join our [community forum](https://community.pgflow.example.com).

## License

This project is licensed under the MIT License.

---

## pgflow SQL Script

```sql
-- Create workflow management schema
CREATE SCHEMA IF NOT EXISTS pgflow;
SET search_path TO pgflow;

------------------------------------------
-- Core workflow definition tables
------------------------------------------

-- Workflows table - stores workflow definitions
CREATE TABLE pgflow.workflows (
    slug TEXT PRIMARY KEY NOT NULL  -- Unique identifier for the workflow
);

-- Steps table - stores individual steps within workflows
CREATE TABLE pgflow.steps (
    workflow_slug TEXT NOT NULL REFERENCES workflows (slug),
    slug TEXT NOT NULL,
    PRIMARY KEY (workflow_slug, slug)
);

-- Dependencies table - stores relationships between steps
CREATE TABLE pgflow.deps (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    from_step_slug TEXT NOT NULL,  -- The step that must complete first
    to_step_slug TEXT NOT NULL,   -- The step that depends on from_step_slug
    PRIMARY KEY (workflow_slug, from_step_slug, to_step_slug),
    FOREIGN KEY (workflow_slug, from_step_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    FOREIGN KEY (workflow_slug, to_step_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    CHECK (from_step_slug != to_step_slug)  -- Prevent self-dependencies
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks workflow execution instances
CREATE TABLE pgflow.runs (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    id UUID PRIMARY KEY NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    CHECK (status IN ('pending', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    run_id UUID NOT NULL REFERENCES pgflow.runs (id),
    step_slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    step_result JSONB,
    PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (workflow_slug, step_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    CHECK (status IN ('pending', 'failed', 'completed'))
);

-- Functions for workflow execution and management
-- (Include all the functions provided in the initial script)
```

**Note**: Replace placeholders with actual URLs or paths as needed.

---

## Contact Us

Have questions or need help? Reach out to us at [support@pgflow.example.com](mailto:support@pgflow.example.com).

---

_This README was generated for illustrative purposes. The actual implementation details may vary._
