import { validateRuntimeOptions, validateSlug } from './utils.ts';

// JSON type enforcement so we can serialize the results to JSONB columns
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

// Used to flatten the types of a union of objects for readability
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type ExtractFlowInput<TFlow extends Flow<any, any, any>> =
  TFlow extends Flow<infer TR, any, any> ? TR : never;

// Extract the TSteps
export type ExtractFlowSteps<TFlow extends Flow<any, any, any>> =
  TFlow extends Flow<any, infer TS, any> ? TS : never;

// Extract the TDependencies
export type ExtractFlowDeps<TFlow extends Flow<any, any, any>> =
  TFlow extends Flow<any, any, infer TD> ? TD : never;

// Utility type to extract the output type of a step handler from a Flow
// Usage:
//   StepOutput<typeof flow, 'step1'>
export type StepOutput<
  TFlow extends Flow<any, any, any>,
  TStepSlug extends string
> = TStepSlug extends keyof ExtractFlowSteps<TFlow>
  ? ExtractFlowSteps<TFlow>[TStepSlug]
  : never;

/**
 * This ensures that:
 * 1. The run input is always included
 * 2. Only declared dependencies are included
 * 3. No extra properties are allowed
 * Utility type to extract the input type for a specific step in a flow
 */
export type StepInput<
  TFlow extends Flow<any, any, any>,
  TStepSlug extends string
> = {
  run: ExtractFlowInput<TFlow>;
} & {
  [K in Extract<
    keyof ExtractFlowSteps<TFlow>,
    ExtractFlowDeps<TFlow>[TStepSlug][number]
  >]: ExtractFlowSteps<TFlow>[K];
};

// Runtime options interface
export interface RuntimeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}

// Define the StepDefinition interface with integrated options
export interface StepDefinition<Input extends Json, RetType extends Json> {
  slug: string;
  handler: (input: Input) => RetType | Promise<RetType>;
  dependencies: string[];
  options: RuntimeOptions;
}

// Utility type to merge two object types and preserve required properties
type MergeObjects<T1 extends object, T2 extends object> = T1 & T2;

// Flow class definition
export class Flow<
  TRunInput extends Json,
  Steps extends Record<string, Json> = Record<never, never>,
  StepDependencies extends Record<string, string[]> = Record<string, string[]>
> {
  // Store step definitions with their proper types
  private stepDefinitions: Record<string, StepDefinition<any, Json>>;
  private stepOrder: string[];
  public readonly slug: string;
  public readonly options: RuntimeOptions;

  constructor(
    config: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitions: Record<string, StepDefinition<any, Json>> = {},
    stepOrder: string[] = []
  ) {
    // Extract slug and options separately
    const { slug, ...options } = config;

    // Validate the slug
    validateSlug(slug);

    // Validate runtime options (optional for Flow level)
    validateRuntimeOptions(options, { optional: true });

    this.slug = slug;
    this.options = options;
    this.stepDefinitions = stepDefinitions;
    // Defensive copy of stepOrder
    this.stepOrder = [...stepOrder];
  }

  /**
   * Get a specific step definition by slug with proper typing
   * @throws Error if the step with the given slug doesn't exist
   */
  getStepDefinition<SlugType extends keyof Steps & keyof StepDependencies>(
    slug: SlugType
  ): StepDefinition<StepInput<this, SlugType & string>, Steps[SlugType]> {
    // Check if the slug exists in stepDefinitions using a more explicit pattern
    if (!(slug in this.stepDefinitions)) {
      throw new Error(
        `Step "${String(slug)}" does not exist in flow "${this.slug}"`
      );
    }

    // Use unknown as an intermediate step for safer type conversion
    // This follows TypeScript's recommendation for this kind of type conversion
    return this.stepDefinitions[slug as string] as StepDefinition<
      StepInput<this, SlugType & string>,
      Steps[SlugType]
    >;
  }

  step<
    Slug extends string,
    Deps extends Extract<keyof Steps, string> = never,
    RetType extends Json = Json
  >(
    opts: Simplify<{ slug: Slug; dependsOn?: Deps[] } & RuntimeOptions>,
    handler: (
      input: Simplify<StepInput<this, Slug>>
    ) => RetType | Promise<RetType>
  ): Flow<
    TRunInput,
    Steps & { [K in Slug]: Awaited<RetType> },
    StepDependencies & { [K in Slug]: Deps[] }
  > {
    type StepInputType = StepInput<this, Slug>;
    type NewSteps = MergeObjects<Steps, { [K in Slug]: Awaited<RetType> }>;
    type NewDependencies = MergeObjects<
      StepDependencies,
      { [K in Slug]: Deps[] }
    >;

    const slug = opts.slug as Slug;

    // Validate the step slug
    validateSlug(slug);

    if (this.stepDefinitions[slug]) {
      throw new Error(`Step "${slug}" already exists in flow "${this.slug}"`);
    }

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

    // Validate runtime options (optional for step level)
    validateRuntimeOptions(options, { optional: true });

    // Preserve the exact type of the handler
    const newStepDefinition: StepDefinition<StepInputType, RetType> = {
      slug,
      handler: handler as (input: StepInputType) => RetType | Promise<RetType>,
      dependencies: dependencies as string[],
      options,
    };

    const newStepDefinitions = {
      ...this.stepDefinitions,
      [slug]: newStepDefinition,
    };

    // Create a new stepOrder array with the new slug appended
    const newStepOrder = [...this.stepOrder, slug];

    // Create a new flow with the same slug and options but with updated type parameters
    return new Flow<TRunInput, NewSteps, NewDependencies>(
      { slug: this.slug, ...this.options },
      newStepDefinitions,
      newStepOrder
    ) as Flow<TRunInput, NewSteps, NewDependencies>;
  }
}
