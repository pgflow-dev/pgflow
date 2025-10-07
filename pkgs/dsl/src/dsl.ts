import { validateRuntimeOptions, validateSlug } from './utils.js';

// ========================
// CORE TYPE DEFINITIONS
// ========================

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

// Utility that unwraps Promise and keeps plain values unchanged
// Note: `any[]` is required here for proper type inference in conditional types
// `unknown[]` would be too restrictive and break type matching
type AwaitedReturn<T> = T extends (...args: any[]) => Promise<infer R>
  ? R
  : T extends (...args: any[]) => infer R
    ? R
    : never;

// ========================
// ENVIRONMENT TYPE SYSTEM
// ========================

// Base environment interface - minimal requirements
export interface Env {
  [key: string]: string | undefined;
}

// Validation utility for environment variables
export type ValidEnv<T> = T extends Env ? T : never;

// Empty interface that users can augment via declaration merging
// Must extend Env to be compatible with ValidEnv constraint
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
export interface UserEnv extends Env {}

// ========================
// FLOW COMPONENT TYPES
// ========================

// Input Types
export type AnyInput = Json;
export type AnyOutput = Json;

// Step Types
export type EmptySteps = Record<never, never>;
export type AnySteps = Record<string, AnyOutput>; // Could use unknown if needed

// Dependency Types
export type EmptyDeps = Record<never, never[]>;
export type DefaultDeps = Record<string, string[]>;
export type AnyDeps = Record<string, string[]>;

// ========================
// FLOW TYPE VARIANTS
// ========================

/**
 * Represents a Flow that has not steps nor deps defined yet
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmptyFlow = Flow<AnyInput, {}, EmptySteps, EmptyDeps>;

/**
 * Represents any Flow with flexible input, context, steps, and dependencies.
 * This type is intentionally more permissive to allow for better type inference
 * in utility types like StepOutput.
 */
export type AnyFlow = Flow<any, any, any, any, any>;

// ========================
// UTILITY TYPES (with proper constraints)
// ========================

/**
 * Extracts the input type from a Flow
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowInput<TFlow extends AnyFlow> = TFlow extends Flow<
  infer TI,
  infer _TC,
  infer _TS,
  infer _TD,
  infer _TEnv
>
  ? TI
  : never;

/**
 * Utility type to extract all possible step inputs from a flow
 * This creates a union of all step input types
 */
export type AllStepInputs<TFlow extends AnyFlow> = {
  [K in keyof ExtractFlowSteps<TFlow> & string]: StepInput<TFlow, K>
}[keyof ExtractFlowSteps<TFlow> & string];

/**
 * Extracts the output type from a Flow
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowOutput<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer _TC,
  infer _TS,
  infer _TD,
  infer _TEnv
>
  ? {
      [K in keyof ExtractFlowLeafSteps<TFlow> as K extends string
        ? K
        : never]: StepOutput<TFlow, K & string>;
    }
  : never;

/**
 * Extracts the steps type from a Flow
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowSteps<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer _TC,
  infer TS,
  infer _TD,
  infer _TEnv
>
  ? TS
  : never;

/**
 * Extracts the dependencies type from a Flow
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowDeps<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer _TC,
  infer _TS,
  infer TD,
  infer _TEnv
>
  ? TD
  : never;

/**
 * Extracts the environment type from a Flow
 * @template TFlow - The Flow type to extract from
 * Returns the TEnv type parameter
 */
export type ExtractFlowEnv<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer _TC,
  infer _TS,
  infer _TD,
  infer TEnv
>
  ? TEnv
  : never;

/**
 * Extracts the full handler context type from a Flow
 * @template TFlow - The Flow type to extract from
 * Returns FlowContext<TEnv> & TContext (the complete context handlers receive)
 */
export type ExtractFlowContext<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer TC,
  infer _TS,
  infer _TD,
  infer TEnv
>
  ? FlowContext<TEnv> & TC
  : never;

/**
 * Extracts the dependencies type from a Flow
 * @template TFlow - The Flow type to extract from
 */
type StepDepsOf<
  TFlow extends AnyFlow,
  TStepSlug extends string
> = TStepSlug extends keyof ExtractFlowDeps<TFlow>
  ? ExtractFlowDeps<TFlow>[TStepSlug][number] // The string slugs that TStepSlug depends on
  : never;

/**
 * Extracts only the leaf steps from a Flow (steps that are not dependencies of any other steps)
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowLeafSteps<TFlow extends AnyFlow> = {
  [K in keyof ExtractFlowSteps<TFlow> as K extends string
    ? K extends ExtractFlowDeps<TFlow>[keyof ExtractFlowDeps<TFlow>][number]
      ? never
      : K
    : never]: ExtractFlowSteps<TFlow>[K];
};

// Utility type to extract the output type of a step handler from a Flow
// Usage:
//   StepOutput<typeof flow, 'step1'>
export type StepOutput<
  TFlow extends AnyFlow,
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
export type StepInput<TFlow extends AnyFlow, TStepSlug extends string> = {
  run: ExtractFlowInput<TFlow>;
} & {
  [K in Extract<
    keyof ExtractFlowSteps<TFlow>,
    StepDepsOf<TFlow, TStepSlug>
  >]: ExtractFlowSteps<TFlow>[K];
};

// Runtime options interface for flow-level options
export interface RuntimeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}

// Worker configuration exposed to handlers (read-only view)
export interface WorkerConfig {
  maxConcurrent: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
  batchSize: number;
  visibilityTimeout: number;
}

// Message record interface (minimal contract - actual type defined in @pgflow/core)
export interface MessageRecord {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Json;
}

// Step task record interface (minimal contract - actual type defined in @pgflow/core)
export interface StepTaskRecord<TFlow extends AnyFlow> {
  flow_slug: string;
  run_id: string;
  step_slug: string;
  input: Json; // JSON-serializable input from database (JSONB column)
  msg_id: number;
}

// Base context for queue workers (no stepTask)
export interface BaseContext<TEnv extends Env = Env> {
  env: TEnv & ValidEnv<UserEnv>;
  shutdownSignal: AbortSignal;
  rawMessage: MessageRecord;
  workerConfig: Readonly<WorkerConfig>;
}

// Flow context extends base with stepTask
export interface FlowContext<TEnv extends Env = Env> extends BaseContext<TEnv> {
  stepTask: StepTaskRecord<AnyFlow>;
}

// Generic context type helper (uses FlowContext for flow handlers)
export type Context<T extends Record<string, unknown> = Record<string, never>, TEnv extends Env = Env> = FlowContext<TEnv> & T;

// Step runtime options interface that extends flow options with step-specific options
export interface StepRuntimeOptions extends RuntimeOptions {
  startDelay?: number;
}

// Define the StepDefinition interface with integrated options
export interface StepDefinition<
  TInput extends AnyInput,
  TOutput extends AnyOutput,
  TContext = FlowContext
> {
  slug: string;
  handler: (input: TInput, context: TContext) => TOutput | Promise<TOutput>;
  dependencies: string[];
  options: StepRuntimeOptions;
}

// Utility type to merge two object types and preserve required properties
type MergeObjects<T1 extends object, T2 extends object> = T1 & T2;

// Flow class definition
export class Flow<
  TFlowInput extends AnyInput = AnyInput,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TContext extends Record<string, unknown> = {}, // Accumulated custom context (FlowContext is always provided)
  Steps extends AnySteps = EmptySteps,
  StepDependencies extends AnyDeps = EmptyDeps,
  TEnv extends Env = Env // Environment type (defaults to base Env)
> {
  /**
   * Store step definitions with their proper types
   *
   * This is typed as a generic record because TypeScript cannot track the exact relationship
   * between step slugs and their corresponding input/output types at the container level.
   * Type safety is enforced at the method level when adding or retrieving steps.
   */
  private stepDefinitions: Record<string, StepDefinition<AnyInput, AnyOutput>>;
  public readonly stepOrder: string[];
  public readonly slug: string;
  public readonly options: RuntimeOptions;

  constructor(
    config: Simplify<{ slug: string } & RuntimeOptions>,
    stepDefinitions: Record<string, StepDefinition<AnyInput, AnyOutput>> = {},
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
  ): StepDefinition<
    Simplify<
      {
        run: TFlowInput;
      } & {
        [K in StepDependencies[SlugType][number]]: K extends keyof Steps
          ? Steps[K]
          : never;
      }
    >,
    Steps[SlugType]
  > {
    // Check if the slug exists in stepDefinitions using a more explicit pattern
    if (!(slug in this.stepDefinitions)) {
      throw new Error(
        `Step "${String(slug)}" does not exist in flow "${this.slug}"`
      );
    }

    // Use a type assertion directive to tell TypeScript that this is safe
    // @ts-expect-error The type system cannot track that this.stepDefinitions[slug] has the correct type
    // but we know it's safe because we only add steps through the strongly-typed `step` method
    return this.stepDefinitions[slug as string];
  }

  // SlugType extends keyof Steps & keyof StepDependencies
  step<
    Slug extends string,
    THandler extends (
      input: Simplify<
        {
          run: TFlowInput;
        } & {
          [K in Deps]: K extends keyof Steps ? Steps[K] : never;
        }
      >,
      context: FlowContext<TEnv> & TContext
    ) => any,
    Deps extends Extract<keyof Steps, string> = never
  >(
    opts: Simplify<{ slug: Slug; dependsOn?: Deps[] } & StepRuntimeOptions>,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: AwaitedReturn<THandler> },
    StepDependencies & { [K in Slug]: Deps[] },
    TEnv
  > {
    type RetType = AwaitedReturn<THandler>;
    type NewSteps = MergeObjects<Steps, { [K in Slug]: RetType }>;
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
    const options: StepRuntimeOptions = {};
    if (opts.maxAttempts !== undefined) options.maxAttempts = opts.maxAttempts;
    if (opts.baseDelay !== undefined) options.baseDelay = opts.baseDelay;
    if (opts.timeout !== undefined) options.timeout = opts.timeout;
    if (opts.startDelay !== undefined) options.startDelay = opts.startDelay;

    // Validate runtime options (optional for step level)
    validateRuntimeOptions(options, { optional: true });

    // Preserve the exact type of the handler
    const newStepDefinition: StepDefinition<
      Simplify<
        {
          run: TFlowInput;
        } & {
          [K in Deps]: K extends keyof Steps ? Steps[K] : never;
        }
      >,
      RetType & Json,
      FlowContext<TEnv> & TContext
    > = {
      slug,
      handler: handler as any, // Type assertion needed due to complex generic constraints
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
    // We need to use type assertions here because TypeScript cannot track the exact relationship
    // between the specific step definition types and the generic Flow type parameters
    // This is safe because we're constructing the newStepDefinitions in a type-safe way above
    return new Flow<TFlowInput, TContext, NewSteps, NewDependencies, TEnv>(
      { slug: this.slug, ...this.options },
      newStepDefinitions as Record<string, StepDefinition<AnyInput, AnyOutput>>,
      newStepOrder
    ) as Flow<TFlowInput, TContext, NewSteps, NewDependencies, TEnv>;
  }

  /**
   * Add an array-returning step to the flow with compile-time type safety
   * 
   * This method provides semantic clarity and type enforcement for steps that return arrays,
   * while maintaining full compatibility with the existing step system by delegating to `.step()`.
   * 
   * @template Slug - The unique identifier for this step
   * @template THandler - The handler function that must return an array or Promise<array>
   * @template Deps - The step dependencies (must be existing step slugs)
   * @param opts - Step configuration including slug, dependencies, and runtime options
   * @param handler - Function that processes input and returns an array
   * @returns A new Flow instance with the array step added
   */
  array<
    Slug extends string,
    THandler extends (
      input: Simplify<
        {
          run: TFlowInput;
        } & {
          [K in Deps]: K extends keyof Steps ? Steps[K] : never;
        }
      >,
      context: BaseContext & TContext
    ) => Array<Json> | Promise<Array<Json>>,
    Deps extends Extract<keyof Steps, string> = never
  >(
    opts: Simplify<{ slug: Slug; dependsOn?: Deps[] } & StepRuntimeOptions>,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: AwaitedReturn<THandler> },
    StepDependencies & { [K in Slug]: Deps[] },
    TEnv
  > {
    // Delegate to existing .step() method for maximum code reuse
    return this.step(opts, handler);
  }
}
