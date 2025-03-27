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
export type StepOutput<F, S extends string> = F extends Flow<
  infer _,
  infer Steps
>
  ? S extends keyof Steps
    ? Steps[S]
    : never
  : never;

/**
 * This ensures that:
 * 1. The run payload is always included
 * 2. All dependencies are required
 * 3. No extra properties are allowed
 * Utility type to extract the input type for a specific step in a flow
 */
export type StepInput<
  TRunPayload extends Json,
  TSteps extends Record<string, Json>,
  TStepSlug extends string
> = TStepSlug extends keyof TSteps
  ? { run: TRunPayload } & {
      [K in Exclude<keyof TSteps, TStepSlug>]: TSteps[K];
    }
  : { run: TRunPayload };

// Runtime options interface
export interface RuntimeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}

// Define the StepDefinition interface with integrated options
export interface StepDefinition<Payload extends Json, RetType extends Json> {
  slug: string;
  handler: (payload: Payload) => RetType | Promise<RetType>;
  dependencies: string[];
  options: RuntimeOptions;
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
  private stepOrder: string[];
  public readonly slug: string;
  public readonly options: RuntimeOptions;

  constructor(
    config: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitions: Record<string, StepDefinition<Json, Json>> = {},
    stepOrder: string[] = []
  ) {
    // Extract slug and options separately
    const { slug, ...options } = config;
    this.slug = slug;
    this.options = options;
    this.stepDefinitions = stepDefinitions;
    // Defensive copy of stepOrder
    this.stepOrder = [...stepOrder];
  }

  /**
   * Returns all step definitions for this flow
   */
  getSteps(): Record<string, StepDefinition<Json, Json>> {
    return this.stepDefinitions;
  }

  /**
   * Get a specific step definition by slug with proper typing
   * @throws Error if the step with the given slug doesn't exist
   */
  getStepDefinition<SlugType extends keyof Steps>(
    slug: SlugType
  ): StepDefinition<
    StepInput<RunPayload, Steps, string & SlugType>,
    Steps[SlugType]
  > {
    // Check if the slug exists in stepDefinitions using a more explicit pattern
    if (!(slug in this.stepDefinitions)) {
      throw new Error(
        `Step "${String(slug)}" does not exist in flow "${this.slug}"`
      );
    }

    // Use unknown as an intermediate step for safer type conversion
    // This follows TypeScript's recommendation for this kind of type conversion
    return this.stepDefinitions[slug as string] as unknown as StepDefinition<
      StepInput<RunPayload, Steps, string & SlugType>,
      Steps[SlugType]
    >;
  }

  /**
   * Returns step definitions in the order they were added with proper typing
   */
  getStepsInOrder(): Array<StepDefinition<Json, Json>> {
    return this.stepOrder.map((slug) => {
      // We need to use a simpler type here to avoid complex type issues
      return this.stepDefinitions[slug];
    });
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
    // Validate dependencies - check if all referenced steps exist
    if (dependencies.length > 0) {
      for (const dep of dependencies) {
        if (!this.stepDefinitions[dep as string]) {
          throw new Error(`Step "${slug}" depends on undefined step "${dep}"`);
        }
      }
    }

    // Extract RuntimeOptions from opts
    const options: RuntimeOptions = {};
    if (opts.maxAttempts !== undefined) options.maxAttempts = opts.maxAttempts;
    if (opts.baseDelay !== undefined) options.baseDelay = opts.baseDelay;
    if (opts.timeout !== undefined) options.timeout = opts.timeout;

    const newStepDefinition: StepDefinition<any, RetType> = {
      slug,
      handler,
      dependencies,
      options,
    };

    const newStepDefinitions = {
      ...this.stepDefinitions,
      [slug]: newStepDefinition,
    };

    // Create a new stepOrder array with the new slug appended
    const newStepOrder = [...this.stepOrder, slug];

    // Create a new flow with the same slug and options
    return new Flow<RunPayload, NewSteps>(
      { slug: this.slug, ...this.options },
      newStepDefinitions,
      newStepOrder
    );
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
