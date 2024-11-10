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

// // Now, let's build the flow
// const flow = new Flow<RunPayload>()
//   .addRootStep("transcribe", async (payload) => {
//     // payload is correctly inferred as RunPayload
//     return {
//       transcription: `Transcribed text for voiceMemoId: ${payload.voiceMemoId}`,
//       length: 27,
//     };
//   })
//   .addStep("summarize", ["transcribe"], async (payload) => {
//     // payload is correctly inferred as { __run__: RunPayload; transcribe: { transcription: string; length: number } }
//     // Access payload.transcribe.transcription without type errors
//     return {
//       summary: `Summary: ${payload.transcribe.transcription}`,
//     };
// });
