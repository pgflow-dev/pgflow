# Brainstorm: Flow DSL → SQL, JSON Schema Generation, and Deployment Strategies

This document explores how we can convert a TypeScript-based **Flow DSL** (a typed object instance describing your workflow) into a **pgflow** definition housed in PostgreSQL. We also discuss best practices for **immutable** flows, versioning via `flow_slug`, and how to handle **JSON Schema** generation for step inputs/outputs. Our goal is an **exceptional developer experience**—enabling both rapid iteration in development and safe, auditable deployments in production.

Below is an outline of potential approaches, trade-offs, and new ideas inspired by similar frameworks.

---

## Why Convert a Flow DSL to SQL?

1. **Single Source of Truth**: The TypeScript DSL is the ideal developer-friendly environment (auto-complete, type inference, etc.) to define the workflow shape. However, pgflow itself requires the flow definition to be materialized as rows in the database (`flows`, `steps`, `deps`).
2. **Immutability Enforcement**: Keeping flows immutable in production simplifies the system: if we detect a new or changed flow shape, we use a new `flow_slug` rather than mutating the old definition.
3. **Visibility & Auditing**: Generating SQL migrations allows teams to see the exact changes to flows over time, fitting existing DevOps pipelines (e.g., ephemeral in dev vs. migrations in prod).

---

## High-Level Workflows

### 1. CLI Tool: “pgflow”

A dedicated CLI tool could handle:

1. **Compile**: Take a `.ts` file with the Flow DSL, generate:
   - SQL statements for `create_flow` and `add_step`.
   - Optionally, **JSON Schemas** for each step’s inputs/outputs (plus the flow’s overall input and output).
2. **Deploy** (Development Mode):
   - Read the DSL in memory, produce SQL, and directly execute against the dev database.
   - Potentially auto-drop existing flows with the same slug (losing old runs, but okay for dev).
3. **Generate Migrations** (Production Mode):
   - Write the generated SQL (and JSON Schemas if needed) to a `.sql` file in `migrations/` for a formal, tracked deployment.
   - If a flow with the same `flow_slug` already exists in the DB but the shape differs, the migration fails (immutable flow violation).
4. **Check**: Compare the DSL shape to what’s in the DB:
   - If it differs, error out (unless you force a new slug).
   - If it’s the same, do nothing.

**Pros**  
- Familiar, explicit approach—TypeScript code → generated SQL → migrations.  
- Integrates well with typical CI/CD tools (Liquibase, Flyway, etc.).  
- Clear separation of concerns around dev vs. prod.

**Cons**  
- Requires running an extra command or hooking it into your build pipeline.  

### 2. Edge Worker Auto-Registration

Alternatively, the Edge Worker can auto-check if a flow is present or matches:

1. On startup or first usage of a flow, the Worker inspects the flow shape.  
2. If that `flow_slug` is missing in the DB:
   - In **dev**, create it on the fly.  
   - In **prod**, optionally refuse or raise an error if no flow definition is found (reducing “magic” behind the scenes).
3. If the same `flow_slug` is found but shapes differ, throw an error (honoring immutability).

**Pros**  
- Minimal friction—no manual step needed.  
- Great for quick local experiments.

**Cons**  
- Less transparent for production pipelines.  
- Could lead to unintentional overwrites if not carefully guarded.

### 3. Hybrid of Both

Commonly, you can combine the CLI approach for local dev (auto-deploy flows on every change) with a “strict” migration approach for production. This approach ensures:

- **Dev:** Speedy iteration, auto-drop for the same slug.  
- **Prod:** Each flow creation is an explicit migration. If shape changes, you must rename the slug or handle versioning carefully.

---

## Handling Immutability and Versioning

pgflow enforces **immutable** flow definitions in production-like environments:

1. **Immutable**: Once `create_flow(flow_slug, ...)` is called, that shape in the DB cannot be replaced.  
2. **Versioning**: If you need to upgrade a flow shape in a backward-incompatible way, create a new slug (e.g. `analyze_website_v2`).  
3. **No “latest” Aliases**: Currently avoided to simplify behavior. Users can implement their own version-discovery logic if needed.

**Why?**  
- Eliminates “partial-upgrades” or in-flight runs being in a broken state.  
- Encourages explicit version bumps, making changes discoverable and trackable.  
- Tends to be simpler operationally, particularly for large teams.

---

## JSON Schema Generation for Validation

An emerging idea is to **auto-generate JSON Schemas** for each step’s input/output based on TypeScript’s type information. This can provide:

1. **DB-Level Validation**: Optionally store these schemas in the `flows` or `steps` table (e.g. in a `json_schemas` column) so that the database can:
   - Validate step output when you call `complete_task`.
   - Validate run input during `start_flow`.
2. **Edge Worker Validation**: The Edge Worker can use the same schemas at runtime to ensure the data processed by each step is well-formed.
3. **Documentation**: The schema acts as living documentation for what each step expects/produces.

**Implementation Sketch**  
- During CLI compilation, parse TypeScript AST or rely on a TypeScript-to-JSON-Schema library (e.g. [typescript-json-schema](https://github.com/YousefED/typescript-json-schema)).  
- For each Flow:
  1. **Flow Input Schema**: Generated from the `Flow<Input>()` input type.  
  2. **Step Output Schemas**: Generated from the return type of each step’s handler.  
  3. Store each schema (or a combined schema object) in an internal structure to be inserted in the DB or saved as `.json` files alongside `.sql` migrations.

**Challenges**  
- Not all TypeScript features map perfectly to JSON Schema.  
- Could lead to extra complexity if not curated carefully.  
- Must decide if we want the DB to do the validation or if the Worker does it pre-insertion.

**Value**  
- Certain data-sensitive or compliance-driven teams might love having strict JSON validations.  
- Great for debugging and ensuring you never pass unexpected data to a step.  
- Aligns with modern “schema-first” or “contract-based” development patterns.

---

## Detailed Example: CLI Flow with JSON Schemas

1. **Define the Flow in TypeScript**  
   ```ts
   import { Flow } from "pgflow-dsl"; // hypothetical npm package

   type FlowInput = { url: string };

   // Returns { content: string; status: number }
   async function scrapeWebsite(args: { run: FlowInput }) { /* ... */ }

   // Returns { sentimentScore: number }
   async function analyzeSentiment(args: { run: FlowInput; website: { content: string } }) { /* ... */ }

   export const AnalyzeWebsiteV2 = new Flow<FlowInput>({
     slug: "analyze_website_v2",
   })
     .step({ slug: "website" }, scrapeWebsite)
     .step({ slug: "sentiment", dependsOn: ["website"] }, analyzeSentiment);
   ```

2. **Compile** (in dev or CI)  
   ```bash
   $ pgflow compile --file=flows/AnalyzeWebsiteV2.ts --out=migrations/2023-10-01_analyze_website_v2
   ```
   This command:
   - Translates the flow definition into SQL that calls `pgflow.create_flow('analyze_website_v2')`, then `pgflow.add_step(...)`.
   - Generates JSON Schemas for:
     - `FlowInput = { url: string }`
     - Output of `scrapeWebsite` = `{ content: string; status: number }`
     - Output of `analyzeSentiment` = `{ sentimentScore: number }`
   - Writes them to:
     - `migrations/2023-10-01_analyze_website_v2.sql`
     - `migrations/2023-10-01_analyze_website_v2schemas.json`
  
3. **Deploy in Development**  
   - Directly run the `.sql` file (auto-drop if you want ephemeral dev).  
   - Insert or update the flow definitions and store the JSON Schemas in a table or a sidecar.  

4. **Deploy in Production**  
   - Use your standard “apply SQL migrations” process.  
   - If the slug `analyze_website_v2` already exists with different shape, the migration fails, ensuring immutability.  
   - JSON Schemas can be inserted in a robust, single transaction for end-to-end validation coverage.  

---

## New Ideas for an Exceptional Developer Experience

Below are some additional ideas inspired by developer-centric tools like Prisma, RedwoodJS, and Hasura:

1. **Interactive CLI** (“Flow Playground”):
   - A TUI (terminal UI) or small local web server that watches your DSL files for changes, regenerates flow definitions in real-time, and displays a DAG diagram (using your JSON Schemas for clarity).
   - Allows you to visually verify your steps, dependencies, and data shapes.

2. **Schema-based “Upgrades”**:
   - For advanced teams, you might track how the JSON Schemas for each step differ between “v1” and “v2.”  
   - Let the CLI generate a helpful diff or summary of what changed in your flow shapes.

3. **Checksum-based Verification**:
   - The DSL → SQL + Schemas produce a unique hash of sorts.  
   - If the deployment script sees a mismatch, it rejects the update unless a new version slug is introduced.  
   - Minimizes accidental “silent updates.”

4. **Embeded JSON Validation**:
   - A variant that uses PostgreSQL’s JSON schema validation extension (if installed) or triggers.  
   - Ensures at the DB level that `complete_task(step_output)` matches the declared JSON Schema.

---

## Quick Start: Checklist

1. **Install the CLI** (hypothetical):  
   ```bash
   npm install -g pgflow-cli
   ```
2. **Author Your Flow** in a `.ts` file.  
3. **Compile** to generate SQL + JSON Schemas:  
   ```bash
   pgflow compile --file flows/myFlow.ts --out migrations/xxxx_my_flow
   ```
4. **Deploy**:
   - **Development**:  
     ```bash
     pgflow deploy --dev migrations/xxxx_my_flow.sql
     ```
   - **Production**:  
     Use your standard migration pipeline to apply the `.sql` (and `.json` if needed).  

5. **Run a Workflow**:
   ```sql
   SELECT * FROM pgflow.start_flow('my_flow_slug', '{"foo":"bar"}'::jsonb);
   ```
6. **Watch** it execute in the [Edge Worker](../edge-worker/README.md) or poll tasks manually.

---

## Conclusion

By introducing a **Flow DSL → SQL** conversion layer, **JSON Schema** generation, and a straightforward **CLI** or **auto-registration** approach, **pgflow** can stay minimal while still giving you a world-class developer experience. Flows remain **immutable** in production, with new slugs representing new shapes, ensuring no half-upgraded states mid-run.

### Key Takeaways

- **MVP Focus**: Keep it simple but design for an awesome DX.  
- **Immutable, Versioned Flows**: A crucial architectural choice to avoid partial upgrades.  
- **Optional JSON Schemas**: A major value-add for teams needing data validation, auditable definitions, and strong typed documentation.  
- **Dev vs. Prod**:
  - Development: auto-recreate flows as you code.  
  - Production: carefully migrated `.sql` and `.json` schemas.  
- **Potential for Growth**: Build a truly “famous” developer-friendly tool by delivering strong defaults, low friction, and the option to scale up complexity where needed.

We encourage you to try out the **pgflow CLI** approach, experiment with auto-generation of JSON Schemas, and integrate them into your development flow. The result is a robust, type-safe, and auditable workflow system that’s both approachable for small teams yet powerful for enterprise-scale needs.
