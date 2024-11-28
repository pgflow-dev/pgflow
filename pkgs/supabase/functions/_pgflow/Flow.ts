// JSON type enforcement so we can serialize the results to JSONB columns
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

// Define the StepDefinition interface
export interface StepDefinition<Payload extends Json, RetType extends Json> {
  name: string;
  handler: (payload: Payload) => RetType | Promise<RetType>;
  dependencies: string[];
}

// Utility type to extract the resolved type from a Promise or a value
type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

// Utility type to merge two object types and preserve required properties
type MergeObjects<T1 extends object, T2 extends object> = T1 & T2;

// Flow class definition
export class Flow<
  RunPayload extends Json,
  Steps extends Record<string, Json> = Record<never, never>,
> {
  // Update the stepDefinitions property to hold the correct types
  private stepDefinitions: Record<string, StepDefinition<Json, Json>>;

  constructor(
    stepDefinitions: Record<string, StepDefinition<Json, Json>> = {},
  ) {
    this.stepDefinitions = stepDefinitions;
  }

  // Function overloads
  task<Name extends string, RetType extends Json>(
    name: Name,
    handler: (payload: { run: RunPayload }) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  >;

  task<
    Name extends string,
    Deps extends keyof Steps & string,
    RetType extends Json,
    Payload extends { run: RunPayload } & { [K in Deps]: Steps[K] },
  >(
    name: Name,
    dependencies: Deps[],
    handler: (payload: Payload) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  >;

  // Implementation
  task<
    Name extends string,
    Deps extends keyof Steps & string,
    RetType extends Json,
    Payload extends { run: RunPayload } & { [K in Deps]: Steps[K] },
  >(
    name: Name,
    handlerOrDeps: ((payload: Payload) => RetType | Promise<RetType>) | Deps[],
    handler?: (payload: Payload) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  > {
    type NewSteps = MergeObjects<
      Steps,
      { [K in Name]: UnwrapPromise<RetType> }
    >;

    const newStepDefinition: StepDefinition<any, RetType> = {
      name,
      handler: typeof handlerOrDeps === "function" ? handlerOrDeps : handler!,
      dependencies: typeof handlerOrDeps === "function" ? [] : handlerOrDeps,
    };

    const newStepDefinitions = {
      ...this.stepDefinitions,
      [name]: newStepDefinition,
    };

    return new Flow<RunPayload, NewSteps>(newStepDefinitions);
  }

  public getSteps(): {
    [K in keyof Steps]: StepDefinition<Json, Steps[K]>;
  } {
    return this.stepDefinitions as {
      [K in keyof Steps]: StepDefinition<Json, Steps[K]>;
    };
  }
}

// Now, let's build the flow
const ExampleFlow = new Flow<{ value: number }>()
  // rootStep return type will be inferred to:
  //
  // { doubledValue: number; };
  .task("rootStep", async (payload) => ({
    doubledValue: payload.run.value * 2,
  }))
  // normalStep return type will be inferred to:
  // { doubledValueArray: number[] };
  .task("normalStep", ["rootStep"], async (payload) => ({
    doubledValueArray: [payload.rootStep.doubledValue],
  }));

export default ExampleFlow;

export type StepsType = ReturnType<typeof ExampleFlow.getSteps>;
