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
  | { [key: string]: Json };

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
 * Type guard that ensures a flow's context requirements can be satisfied
 * by the resources provided by the platform and optional user resources.
 *
 * A flow is compatible if the provided platform and user resources can satisfy
 * all the context requirements declared by the flow.
 *
 * @template F - The Flow type to check for compatibility
 * @template PlatformResources - Resources provided by the execution platform (e.g., Supabase resources)
 * @template UserResources - Additional user-provided resources (default: empty)
 *
 * @example
 * ```typescript
 * // In a platform worker:
 * type SupabaseCompatibleFlow<F extends AnyFlow> = CompatibleFlow<F, SupabaseResources>;
 *
 * // Usage:
 * function startWorker<F extends AnyFlow>(flow: SupabaseCompatibleFlow<F>) {
 *   // flow is guaranteed to be compatible with Supabase platform
 * }
 * ```
 */
export type CompatibleFlow<
  F extends AnyFlow,
  PlatformResources extends Record<string, unknown>,
  UserResources extends Record<string, unknown> = Record<string, never>
> =
  (FlowContext<ExtractFlowEnv<F>> & PlatformResources & UserResources) extends ExtractFlowContext<F>
    ? F
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
 * Asymmetric step input type:
 * - Root steps (no dependencies): receive flow input directly
 * - Dependent steps: receive only their dependencies (flow input available via context)
 *
 * This enables functional composition where subflows can receive typed inputs
 * without the 'run' wrapper that previously blocked type matching.
 */
export type StepInput<TFlow extends AnyFlow, TStepSlug extends string> =
  StepDepsOf<TFlow, TStepSlug> extends never
    ? ExtractFlowInput<TFlow> // Root step: flow input directly
    : {
        [K in Extract<
          keyof ExtractFlowSteps<TFlow>,
          StepDepsOf<TFlow, TStepSlug>
        >]: ExtractFlowSteps<TFlow>[K];
      }; // Dependent step: only deps

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

/**
 * Flow context extends base with stepTask and flowInput.
 *
 * Note: flowInput is a Promise to support lazy loading. Only root non-map steps
 * receive flow_input from SQL; other step types lazy-load it on demand.
 * Use `await ctx.flowInput` to access the original flow input.
 */
export interface FlowContext<TEnv extends Env = Env, TFlowInput extends AnyInput = AnyInput> extends BaseContext<TEnv> {
  stepTask: StepTaskRecord<AnyFlow>;
  flowInput: Promise<TFlowInput>;
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
  stepType?: 'single' | 'map';
}

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
   *
   * Returns the step definition with asymmetric input typing:
   * - Root steps (no dependencies): input is flowInput directly
   * - Dependent steps: input is deps object only (flowInput available via context)
   *
   * @throws Error if the step with the given slug doesn't exist
   */
  getStepDefinition<SlugType extends keyof Steps & keyof StepDependencies>(
    slug: SlugType
  ): StepDefinition<
    StepDependencies[SlugType] extends [] | readonly []
      ? TFlowInput // Root step: flow input directly
      : Simplify<{
          [K in StepDependencies[SlugType][number]]: K extends keyof Steps
            ? Steps[K]
            : never;
        }>, // Dependent step: only deps
    Steps[SlugType],
    FlowContext<TEnv, TFlowInput> & TContext
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

  // Overload 1: Root step (no dependsOn) - receives flowInput directly
  step<
    Slug extends string,
    TOutput
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug; dependsOn?: never } & StepRuntimeOptions>,
    handler: (
      flowInput: TFlowInput,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: Awaited<TOutput> },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload 2: Dependent step (with dependsOn) - receives deps, flowInput via context
  // Note: [Deps, ...Deps[]] requires at least one dependency - empty arrays are rejected at compile time
  step<
    Slug extends string,
    Deps extends Extract<keyof Steps, string>,
    TOutput
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug; dependsOn: [Deps, ...Deps[]] } & StepRuntimeOptions>,
    handler: (
      deps: { [K in Deps]: K extends keyof Steps ? Steps[K] : never },
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: Awaited<TOutput> },
    StepDependencies & { [K in Slug]: Deps[] },
    TEnv
  >;

  // Implementation (type safety enforced by overloads above)
  step(opts: any, handler: any): any {
    const slug = opts.slug;

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

    // Create step definition (type assertions needed due to complex generic constraints)
    const newStepDefinition: StepDefinition<AnyInput, AnyOutput> = {
      slug,
      handler,
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
    // Type safety is enforced by the overload signatures above
    return new Flow(
      { slug: this.slug, ...this.options },
      newStepDefinitions,
      newStepOrder
    );
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
   * @param handler - Function that processes input and returns an array (null/undefined rejected)
   * @returns A new Flow instance with the array step added
   */
  // Overload 1: Root array (no dependsOn) - receives flowInput directly
  array<
    Slug extends string,
    TOutput extends readonly any[]
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug; dependsOn?: never } & StepRuntimeOptions>,
    handler: (
      flowInput: TFlowInput,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: Awaited<TOutput> },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload 2: Dependent array (with dependsOn) - receives deps, flowInput via context
  // Note: [Deps, ...Deps[]] requires at least one dependency - empty arrays are rejected at compile time
  array<
    Slug extends string,
    Deps extends Extract<keyof Steps, string>,
    TOutput extends readonly any[]
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug; dependsOn: [Deps, ...Deps[]] } & StepRuntimeOptions>,
    handler: (
      deps: { [K in Deps]: K extends keyof Steps ? Steps[K] : never },
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: Awaited<TOutput> },
    StepDependencies & { [K in Slug]: Deps[] },
    TEnv
  >;

  // Implementation
  array(opts: any, handler: any): any {
    // Delegate to existing .step() method for maximum code reuse
    return this.step(opts, handler);
  }

  /**
   * Add a map step to the flow that processes arrays element by element
   *
   * Map steps apply a handler function to each element of an array, producing
   * a new array with the transformed elements. The handler receives individual
   * array elements, not the full input object.
   *
   * @param opts - Step configuration including slug and optional array dependency
   * @param handler - Function that processes individual array elements
   * @returns A new Flow instance with the map step added
   */
  // Overload for root map - handler receives item, context includes flowInput
  map<
    Slug extends string,
    THandler extends TFlowInput extends readonly (infer Item)[]
      ? (item: Item, context: FlowContext<TEnv, TFlowInput> & TContext) => Json | Promise<Json>
      : never
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug } & StepRuntimeOptions>,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: AwaitedReturn<THandler>[] },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload for dependent map - handler receives item, context includes flowInput
  map<
    Slug extends string,
    TArrayDep extends Extract<keyof Steps, string>,
    THandler extends Steps[TArrayDep] extends readonly (infer Item)[]
      ? (item: Item, context: FlowContext<TEnv, TFlowInput> & TContext) => Json | Promise<Json>
      : never
  >(
    opts: Simplify<{ slug: Slug extends keyof Steps ? never : Slug; array: TArrayDep } & StepRuntimeOptions>,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & { [K in Slug]: AwaitedReturn<THandler>[] },
    StepDependencies & { [K in Slug]: [TArrayDep] },
    TEnv
  >;

  // Implementation
  map(opts: any, handler: any): any {
    const slug = opts.slug;

    // Validate the step slug
    validateSlug(slug);

    if (this.stepDefinitions[slug]) {
      throw new Error(`Step "${slug}" already exists in flow "${this.slug}"`);
    }

    // Determine dependencies based on whether array is specified
    let dependencies: string[] = [];
    const arrayDep = (opts as any).array;
    if (arrayDep) {
      // Dependent map - validate single dependency exists and returns array
      if (!this.stepDefinitions[arrayDep]) {
        throw new Error(`Step "${slug}" depends on undefined step "${arrayDep}"`);
      }
      dependencies = [arrayDep];
    } else {
      // Root map - flow input must be an array (type system enforces this)
      dependencies = [];
    }

    // Extract runtime options
    const options: StepRuntimeOptions = {};
    if (opts.maxAttempts !== undefined) options.maxAttempts = opts.maxAttempts;
    if (opts.baseDelay !== undefined) options.baseDelay = opts.baseDelay;
    if (opts.timeout !== undefined) options.timeout = opts.timeout;
    if (opts.startDelay !== undefined) options.startDelay = opts.startDelay;

    // Validate runtime options
    validateRuntimeOptions(options, { optional: true });

    // Create the map step definition with stepType
    // Note: We use AnyInput/AnyOutput here because the actual types are handled at the type level via overloads
    const newStepDefinition: StepDefinition<AnyInput, AnyOutput, BaseContext & TContext> = {
      slug,
      handler: handler as any, // Type assertion needed due to complex generic constraints
      dependencies,
      options,
      stepType: 'map', // Mark this as a map step
    };

    const newStepDefinitions = {
      ...this.stepDefinitions,
      [slug]: newStepDefinition,
    };

    // Create a new stepOrder array with the new slug appended
    const newStepOrder = [...this.stepOrder, slug];

    // Create and return new Flow instance with updated types
    return new Flow(
      { slug: this.slug, ...this.options },
      newStepDefinitions as Record<string, StepDefinition<AnyInput, AnyOutput>>,
      newStepOrder
    ) as any; // Type assertion handled by overloads
  }
}
