I'm working on workflow engine implemented on top of postgres with a typescript statically and strongly typed DSL for defining workflows and inserting them to db (flows/steps/dependencies and runtime state are kept in db)

when installing pgflow (my engine) into a supabase project, one is supposed to run "npx pgflow install --migrations-path=supabase/migratoins --flows-path=supabase/flows" and it should create supabase/flows folder and copy pgflow migrations to supabase folder.

then user defines his flows in supabase/flows using the pgflow package (just importing 
Flow class and using it to build the DAG flow).
this should result in a default export of instance of Flow class with defined steps etc.

this flow class will be used in following way:
- in pgflow edge function handler to handle particular step using its handler function (will be called by pgflow from within db)
- when inserting workflow to database, to convert graph structure to inserts to flows, steps and deps tables
- when inserting workflow to database, to infer the return types for each handler automatically (without adding any additional type annotations - pgflow-dsl is already type infering result values based on run payload and flow of functions - one need to only generate JSON schemas for all handler return types) - the json schemas then are saved with steps definitions as "result_schema" column (not yet implemented) which later is used to validate calls to complete_step (if the payload passed to complete step for given step does not match the provided result_schema, it should be marked as failure)

the last way how defined flows will be used is to trigger workflows client side, for example in a frontend app - one imports the flows and just calls Flow.run(runPayload) - the run should be typed like the run payload.

My main focus should be DX, hence my questions:
- is my suggested approach a good one?
- can a single folder with flows/*.ts classes be used both by edge functions (deno runtime), json schema inference (typescript compiler, ts-morph, ts-json-schema-generator) and frontend app (vite on node, browser)
- how to make it as easy as possible so it is not a burden for user, but allow to reuse the code everywhere?

See my code:

## Flow.ts

```typescript
// JSON type enforcement so we can serialize the results to JSONB columns
type SerializableToJson =
  | string
  | number
  | boolean
  | null
  | SerializableToJson[]
  | { [key: string]: SerializableToJson };

// Utility type to extract the resolved type from a Promise or a value
type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

// Utility type to merge two object types and preserve required properties
type MergeObjects<T1 extends object, T2 extends object> = {
  [K in keyof T1 | keyof T2]: K extends keyof T2
    ? T2[K]
    : K extends keyof T1
      ? T1[K]
      : never;
};

// Flow class definition
export class Flow<
  RunPayload extends SerializableToJson,
  Steps extends object = Record<never, never>,
> {
  constructor(private steps: Steps = {} as Steps) {}

  // Method to add root steps (no dependencies)
  addRootStep<Name extends string, RetType extends SerializableToJson>(
    name: Name,
    handler: (payload: RunPayload) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  > {
    type NewSteps = MergeObjects<
      Steps,
      { [K in Name]: UnwrapPromise<RetType> }
    >;

    this.steps = {
      ...this.steps,
      [name]: { name, handler, deps: [] },
    };

    console.log("addRootStep", this.steps);
    return new Flow<RunPayload, NewSteps>(this.steps as NewSteps);
  }

  // Method to add steps with dependencies
  addStep<
    Name extends string,
    Deps extends keyof Steps,
    RetType extends SerializableToJson,
  >(
    name: Name,
    dependencies: Deps[],
    handler: (
      payload: { __run__: RunPayload } & { [K in Deps]: Steps[K] },
    ) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  > {
    type NewSteps = MergeObjects<
      Steps,
      { [K in Name]: UnwrapPromise<RetType> }
    >;

    this.steps = {
      ...this.steps,
      [name]: { name, dependencies, handler },
    };

    console.log("addStep", this.steps);
    return new Flow<RunPayload, NewSteps>(this.steps as NewSteps);
  }
}
```

## Example flow created with Flow DSL:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { Flow } from "./Flow.ts";

const supabase: SupabaseClient = {} as SupabaseClient;
const groq = new Groq();

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const flow = new Flow<RunPayload>()
  .addRootStep("transcribe", async ({ objectName, bucketId }) => {
    const response = await supabase.storage.from(bucketId).download(objectName);

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (!response.data) {
      throw new Error("No data found");
    }

    // Convert Blob to File with required properties
    const audioFile = new File(
      [new Uint8Array(await response.data.arrayBuffer())],
      objectName,
      {
        type: response.data.type,
        lastModified: Date.now(),
      },
    );

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "verbose_json",
    });

    if (!transcription.text) {
      throw new Error("No transcription found");
    }

    return { transcription: transcription.text };
  })
  .addStep(
    "summarize",
    ["transcribe"],
    async ({ transcribe, __run__: { ownerId } }) => {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Summarize the voice memo in one, concise sentence. Output only this sentence, nothing else",
          },
          { role: "user", content: transcribe.transcription },
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0,
        max_tokens: 1024,
      });

      return {
        summary: chatCompletion.choices[0].message.content,
        runOwnerId: ownerId,
      };
    },
  )
  .addStep(
    "capitalize",
    ["transcribe"],
    ({ transcribe: { transcription } }) => {
      return transcription.toUpperCase();
    },
  )
  .addStep("merge", ["summarize", "capitalize"], (payload) => {
    return JSON.stringify(payload);
  });
export default flow;
```

The json schema generator should take this file and the type annotations provided by Flow class (which make each step handler function have its results typed, because it is inferrred from dependencies and run payload). So the json schema generation should not happen statically but probably need to execute the file conttaining given flow to understand its types?? not sure

## Schema (tables):

```sql
-- Create flow management schema
CREATE SCHEMA IF NOT EXISTS pgflow;
SET search_path TO pgflow;

--------------------------------------------------------------------------
------------------ TODO: fix me, UNSECURE --------------------------------
--------------------------------------------------------------------------
GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow TO anon,
authenticated,
service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

------------------------------------------
-- Core flow definition tables
------------------------------------------

-- Flows table - stores flow definitions
CREATE TABLE pgflow.flows (
    flow_slug TEXT PRIMARY KEY NOT NULL  -- Unique identifier for the flow
);

-- Steps table - stores individual steps within flows
CREATE TABLE pgflow.steps (
    flow_slug TEXT NOT NULL REFERENCES flows (flow_slug),
    step_slug TEXT NOT NULL,
    PRIMARY KEY (flow_slug, step_slug)
);

-- Dependencies table - stores relationships between steps
CREATE TABLE pgflow.deps (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    from_step_slug TEXT NOT NULL,  -- The step that must complete first
    to_step_slug TEXT NOT NULL,   -- The step that depends on from_step_slug
    PRIMARY KEY (flow_slug, from_step_slug, to_step_slug),
    FOREIGN KEY (flow_slug, from_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    FOREIGN KEY (flow_slug, to_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (from_step_slug != to_step_slug)  -- Prevent self-dependencies
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks flow execution instances
CREATE TABLE pgflow.runs (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id UUID PRIMARY KEY NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    CHECK (status IN ('pending', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id UUID NOT NULL REFERENCES pgflow.runs (run_id),
    step_slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    step_result JSONB,
    PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (flow_slug, step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (status IN ('pending', 'failed', 'completed'))
);

--- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_states;
```
