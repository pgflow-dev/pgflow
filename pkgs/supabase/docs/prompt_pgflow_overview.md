### PGFlow: Context Description for Chatbots

---

#### **High-Level Overview**

PGFlow is a transactional, database-centric workflow engine built entirely within PostgreSQL. It orchestrates distributed task queues directly from the database, allowing developers to design, execute, and monitor workflows seamlessly. PGFlow is optimized for Postgres-centric environments like Supabase, offering a statically typed and developer-friendly DSL that integrates with TypeScript.

By leveraging PostgreSQL’s inherent transactional guarantees and advisory locks, PGFlow ensures atomic state transitions for workflows, making it reliable and robust. This design eliminates the need for external orchestration layers, enabling simplified deployment and reduced operational overhead.

---

#### **Strong Points**

1. **Database-Centric Workflow Orchestration**: Simplifies workflow management by embedding the logic and state directly into the database.
2. **Transactional Safety**: Ensures atomicity and consistency of workflows even in failure scenarios.
3. **Seamless Integration**: Tailored for Postgres-first ecosystems like Supabase, with support for Edge Functions.
4. **Scalability**: Supports distributed task execution by delegating work to external workers in various languages (e.g., Python, TypeScript).
5. **Developer Experience**: Offers a statically-typed TypeScript DSL for defining workflows, reducing bugs and improving clarity.
6. **Flexibility**: Can orchestrate tasks across multiple environments (e.g., browser, Edge Functions, or dedicated workers).

---

#### **Market Fit and Niche**

PGFlow targets early-stage startups, small founders, solopreneurs, and Supabase developers who prefer Postgres as their primary backend. It caters to users needing affordable, quick-to-integrate solutions for background jobs, parallel processing, and workflow automation. By embedding workflow orchestration into PostgreSQL, PGFlow avoids the complexity and costs associated with external workflow engines, making it an ideal solution for resource-conscious teams.

---

#### **Unique Value Proposition**

PGFlow stands out by:
- Embedding orchestration directly within PostgreSQL.
- Utilizing Postgres advisory locks for distributed coordination without external systems.
- Offering a TypeScript-first workflow definition approach with clear type safety.
- Providing out-of-the-box compatibility with Supabase, allowing workflows to run entirely on Edge Functions.
- Enabling advanced workflows with DAG-based dependency management, parallel step execution, and robust error handling.

---

#### **Technical Details**

1. **Workflow Definition**:
   - Workflows are defined as directed acyclic graphs (DAGs) using a combination of Postgres tables and a TypeScript DSL.
   - `flows` table: Defines workflows.
   - `steps` table: Represents nodes in the DAG.
   - `deps` table: Encodes step dependencies (edges in the DAG).

2. **Runtime State**:
   - `runs` table: Tracks instances of workflow execution.
   - `step_states` table: Monitors individual step statuses (e.g., pending, completed, failed).
   - `step_tasks` table: Logs task execution attempts for retry management and observability.

3. **Execution Engine**:
   - Steps are executed asynchronously by external workers.
   - Dependency management ensures steps only start when their prerequisites are completed.
   - `pgflow_locks` schema uses advisory locks for safe concurrent execution.

4. **Key Functions**:
   - `run_flow`: Initializes a new workflow run and starts root steps.
   - `start_step`: Begins execution of a step, ensuring dependencies are satisfied.
   - `complete_step_task`: Marks a step as completed and triggers dependent steps.
   - `fail_step_task`: Handles step failures and manages retries.

5. **Integration**:
   - Supabase Edge Functions serve as the default execution environment.
   - JSON payloads enable interoperability between PostgreSQL and worker environments.

6. **Developer Workflow**:
   - Define workflows in TypeScript using the provided DSL.
   - Compile workflows into SQL schema definitions.
   - Use the PGFlow CLI for migrations and deployment.

---

PGFlow simplifies complex workflow orchestration by keeping everything in the database, empowering developers to build reliable, scalable, and maintainable systems without external dependencies.
