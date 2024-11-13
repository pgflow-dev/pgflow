// JSON type enforcement so we can serialize the results to JSONB columns
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Define the StepDefinition interface
interface StepDefinition<Payload extends Json, RetType extends Json> {
  name: string;
  handler: (payload: Payload) => RetType | Promise<RetType>;
  dependencies: string[];
}

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
  RunPayload extends Json,
  Steps extends Record<string, Json> = Record<never, never>,
> {
  // Update the stepDefinitions property to hold the correct types
  private stepDefinitions: Record<string, StepDefinition<any, any>>;

  constructor(stepDefinitions: Record<string, StepDefinition<any, any>> = {}) {
    this.stepDefinitions = stepDefinitions;
  }

  addRootStep<Name extends string, RetType extends Json>(
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
    const newStepDefinition: StepDefinition<RunPayload, RetType> = {
      name,
      handler,
      dependencies: [],
    };
    const newStepDefinitions = {
      ...this.stepDefinitions,
      [name]: newStepDefinition,
    };
    return new Flow<RunPayload, NewSteps>(newStepDefinitions);
  }

  // Similarly for addStep
  addStep<
    Name extends string,
    Deps extends keyof Steps & string,
    RetType extends Json,
    Payload extends { __run__: RunPayload } & { [K in Deps]: Steps[K] },
  >(
    name: Name,
    dependencies: Deps[],
    handler: (payload: Payload) => RetType | Promise<RetType>,
  ): Flow<
    RunPayload,
    MergeObjects<Steps, { [K in Name]: UnwrapPromise<RetType> }>
  > {
    type NewSteps = MergeObjects<
      Steps,
      { [K in Name]: UnwrapPromise<RetType> }
    >;
    const newStepDefinition: StepDefinition<Payload, RetType> = {
      name,
      handler,
      dependencies,
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
      [K in keyof Steps]: StepDefinition<any, Steps[K]>;
    };
  }
}

// Now, let's build the flow
const ExampleFlow = new Flow<{ value: number }>()
  // rootStep return type will be inferred to:
  //
  // { doubledValue: number; };
  .addRootStep("rootStep", async (payload) => ({
    doubledValue: payload.value * 2,
  }))
  // normalStep return type will be inferred to:
  // { doubledValueArray: number[] };
  .addStep("normalStep", ["rootStep"], async (payload) => ({
    doubledValueArray: [payload.rootStep.doubledValue],
  }));

export default ExampleFlow;

export type StepsType = ReturnType<typeof ExampleFlow.getSteps>;
