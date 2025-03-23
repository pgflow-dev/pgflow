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
  // Store step definitions in an array to preserve order
  private stepDefinitionsArray: Array<StepDefinition<Json, Json>>;
  // Store additional step options separately
  private stepOptionsStore: StepOptionsStore;

  constructor(
    public flowOptions: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitionsArray: Array<StepDefinition<Json, Json>> = [],
    stepOptionsStore: StepOptionsStore = {}
  ) {
    this.flowOptions = flowOptions;
    this.stepDefinitionsArray = stepDefinitionsArray;
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

    // Create new arrays for immutability
    const newStepDefinitionsArray = [
      ...this.stepDefinitionsArray,
      newStepDefinition,
    ];

    const newStepOptionsStore = {
      ...this.stepOptionsStore,
      [slug]: stepOptions,
    };

    return new Flow<RunPayload, NewSteps>(
      this.flowOptions,
      newStepDefinitionsArray,
      newStepOptionsStore
    );
  }

  public getSteps(): Array<
    StepDefinition<Json, Json> & {
      maxAttempts?: number;
      baseDelay?: number;
      timeout?: number;
    }
  > {
    // Return steps in the order they were added
    return this.stepDefinitionsArray.map((stepDef) => ({
      ...stepDef,
      ...this.stepOptionsStore[stepDef.slug],
    }));
  }

  // Helper method to find a step by slug if needed
  public getStepBySlug(slug: string):
    | (StepDefinition<Json, Json> & {
        maxAttempts?: number;
        baseDelay?: number;
        timeout?: number;
      })
    | undefined {
    const stepDef = this.stepDefinitionsArray.find(
      (step) => step.slug === slug
    );
    if (!stepDef) return undefined;

    return {
      ...stepDef,
      ...this.stepOptionsStore[stepDef.slug],
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

export type StepsType = ReturnType<typeof ExampleFlow.getSteps>[number];
