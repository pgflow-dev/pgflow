// JSON type enforcement so we can serialize the results to JSONB columns
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

// Used to flatten the types of a union of objects for readability
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

// Utility type to extract the output type of a step handler from a Flow
// Usage:
//   StepOutput<typeof flow, 'step1'>
export type StepOutput<F, S extends string> = F extends {
  getSteps(): Record<string, StepDefinition<any, any>>;
}
  ? S extends keyof ReturnType<F['getSteps']>
    ? ReturnType<F['getSteps']>[S] extends StepDefinition<any, infer R>
      ? R
      : never
    : never
  : never;

// Utility type to extract the input type of a step handler from a Flow
// Usage:
//   StepInput<typeof flow, 'step1'>
export type StepInput<F, S extends string> = F extends {
  getSteps(): Record<string, StepDefinition<any, any>>;
}
  ? S extends keyof ReturnType<F['getSteps']>
    ? ReturnType<F['getSteps']>[S] extends StepDefinition<infer P, any>
      ? P
      : never
    : never
  : never;

// Runtime options interface
// Separate from StepDefinition interface to make StepDefinition more focused
// and easier to understand - it is conceptually concerned about enforcing
// the type graph, not just validating the values
export interface RuntimeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}

// Define the StepDefinition interface
export interface StepDefinition<Payload extends Json, RetType extends Json> {
  slug: string;
  handler: (payload: Payload) => RetType | Promise<RetType>;
  dependencies: string[];
}

// Store for additional step options
interface StepOptionsStore {
  [slug: string]: {
    maxAttempts?: number;
    baseDelay?: number;
    timeout?: number;
  };
}

// Utility type to merge two object types and preserve required properties
type MergeObjects<T1 extends object, T2 extends object> = T1 & T2;

// Flow class definition
export class Flow<
  RunPayload extends Json,
  Steps extends Record<string, Json> = Record<never, never>
> {
  // Update the stepDefinitions property to hold the correct types
  private stepDefinitions: Record<string, StepDefinition<Json, Json>>;
  // Store additional step options separately
  private stepOptionsStore: StepOptionsStore;

  constructor(
    public flowOptions: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitions: Record<string, StepDefinition<Json, Json>> = {},
    stepOptionsStore: StepOptionsStore = {}
  ) {
    this.flowOptions = flowOptions;
    this.stepDefinitions = stepDefinitions;
    this.stepOptionsStore = stepOptionsStore;
  }

  step<
    Slug extends string,
    Deps extends Extract<keyof Steps, string> = never,
    RetType extends Json = Json,
    Payload = { run: RunPayload } & { [K in Deps]: Steps[K] }
  >(
    opts: Simplify<{ slug: Slug; dependsOn?: Deps[] } & RuntimeOptions>,
    handler: (payload: { [KeyType in keyof Payload]: Payload[KeyType] }) =>
      | RetType
      | Promise<RetType>
  ): Flow<RunPayload, Steps & { [K in Slug]: Awaited<RetType> }> {
    type NewSteps = MergeObjects<Steps, { [K in Slug]: Awaited<RetType> }>;

    const slug = opts.slug as Slug;
    const dependencies = opts.dependsOn || [];

    const newStepDefinition: StepDefinition<any, RetType> = {
      slug,
      handler,
      dependencies,
    };

    // Store additional options separately
    const stepOptions: StepOptionsStore[string] = {};
    if (opts.maxAttempts !== undefined)
      stepOptions.maxAttempts = opts.maxAttempts;
    if (opts.baseDelay !== undefined) stepOptions.baseDelay = opts.baseDelay;
    if (opts.timeout !== undefined) stepOptions.timeout = opts.timeout;

    const newStepDefinitions = {
      ...this.stepDefinitions,
      [slug]: newStepDefinition,
    };

    const newStepOptionsStore = {
      ...this.stepOptionsStore,
      [slug]: stepOptions,
    };

    return new Flow<RunPayload, NewSteps>(
      this.flowOptions,
      newStepDefinitions,
      newStepOptionsStore
    );
  }

  public getSteps(): {
    [K in keyof Steps]: StepDefinition<Json, Steps[K]> & {
      maxAttempts?: number;
      baseDelay?: number;
      timeout?: number;
    };
  } {
    const result: Record<string, any> = {};

    Object.keys(this.stepDefinitions).forEach((slug) => {
      result[slug] = {
        ...this.stepDefinitions[slug],
        ...this.stepOptionsStore[slug],
      };
    });

    return result as {
      [K in keyof Steps]: StepDefinition<Json, Steps[K]> & {
        maxAttempts?: number;
        baseDelay?: number;
        timeout?: number;
      };
    };
  }
}

// Example usage
const ExampleFlow = new Flow<{ value: number }>({
  slug: 'example_flow',
  maxAttempts: 3,
})
  // rootStep return type will be inferred to:
  //
  // { doubledValue: number; };
  .step({ slug: 'rootStep' }, async (payload) => ({
    doubledValue: payload.run.value * 2,
  }))
  // normalStep return type will be inferred to:
  // { doubledValueArray: number[] };
  .step(
    { slug: 'normalStep', dependsOn: ['rootStep'], maxAttempts: 5 },
    async (payload) => ({
      doubledValueArray: [payload.rootStep.doubledValue],
    })
  );

export default ExampleFlow;

export type StepsType = ReturnType<typeof ExampleFlow.getSteps>;
