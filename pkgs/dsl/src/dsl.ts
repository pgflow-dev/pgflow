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
export type StepOutput<F, S extends string> = F extends Flow<any, infer Steps>
  ? S extends keyof Steps
    ? Steps[S]
    : never
  : never;

/**
 * Utility type to extract the input type for a specific step in a flow
 */
export type StepInput<
  TRunPayload extends Json,
  TSteps extends Record<string, Json>,
  TStepSlug extends string
> = TStepSlug extends keyof TSteps
  ? { run: TRunPayload } & {
      [K in Exclude<keyof TSteps, TStepSlug>]?: TSteps[K];
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
  public readonly slug: string;
  public readonly options: RuntimeOptions;

  constructor(
    config: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitions: Record<string, StepDefinition<Json, Json>> = {}
  ) {
    // Extract slug and options separately
    const { slug, ...options } = config;
    this.slug = slug;
    this.options = options;
    this.stepDefinitions = stepDefinitions;
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

    // Create a new flow with the same slug and options
    return new Flow<RunPayload, NewSteps>(
      { slug: this.slug, ...this.options },
      newStepDefinitions
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
