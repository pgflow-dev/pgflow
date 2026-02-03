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

/**
 * ContainmentPattern<T> - Type for JSON containment (@>) patterns
 *
 * Matches PostgreSQL's @> containment semantics where a pattern is a
 * recursive partial structure that the target must contain:
 * - Primitives: exact value match
 * - Objects: all keys optional, recursively applied
 * - Arrays: elements expected to be present in target array
 */
export type ContainmentPattern<T> = T extends readonly (infer U)[]
  ? ContainmentPattern<U>[] // Array: elements expected to be present
  : T extends object
  ? { [K in keyof T]?: ContainmentPattern<T[K]> } // Object: all keys optional
  : T; // Primitive: exact value match

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
// Skippable mode: 'skip' makes deps optional, 'skip-cascade' keeps deps required
// (because cascade skips dependents at runtime, so if handler runs, dep succeeded)
export type SkippableMode = 'skip' | 'skip-cascade' | false;

// Step metadata structure - enriched type that tracks output and skippability
export interface StepMeta<
  TOutput = AnyOutput,
  TSkippable extends SkippableMode = SkippableMode
> {
  output: TOutput;
  skippable: TSkippable;
}

export type EmptySteps = Record<never, never>;
// AnySteps now uses StepMeta structure for enriched step information
export type AnySteps = Record<string, StepMeta>;

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
  [K in keyof ExtractFlowSteps<TFlow> & string]: StepInput<TFlow, K>;
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
 * Extracts the steps type from a Flow (unwraps StepMeta to just output types)
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowSteps<TFlow extends AnyFlow> = TFlow extends Flow<
  infer _TI,
  infer _TC,
  infer TS,
  infer _TD,
  infer _TEnv
>
  ? { [K in keyof TS]: TS[K]['output'] }
  : never;

/**
 * Extracts the raw steps type from a Flow (includes StepMeta structure with skippable info)
 * @template TFlow - The Flow type to extract from
 */
export type ExtractFlowStepsRaw<TFlow extends AnyFlow> = TFlow extends Flow<
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
> = FlowContext<ExtractFlowEnv<F>> &
  PlatformResources &
  UserResources extends ExtractFlowContext<F>
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
 * Returns the output types, not the full StepMeta structure
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
// Returns the output type (ExtractFlowSteps already unwraps StepMeta)
export type StepOutput<
  TFlow extends AnyFlow,
  TStepSlug extends string
> = TStepSlug extends keyof ExtractFlowSteps<TFlow>
  ? ExtractFlowSteps<TFlow>[TStepSlug]
  : never;

/**
 * Gets the skippable mode for a step ('skip' | 'skip-cascade' | false)
 * @template TFlow - The Flow type
 * @template TStepSlug - The step slug to check
 */
export type GetSkippableMode<
  TFlow extends AnyFlow,
  TStepSlug extends string
> = TStepSlug extends keyof ExtractFlowStepsRaw<TFlow>
  ? ExtractFlowStepsRaw<TFlow>[TStepSlug]['skippable']
  : false;

/**
 * Checks if a step makes its dependents' deps optional (only 'skip' mode, not 'skip-cascade')
 * With 'skip-cascade', dependents are also skipped at runtime, so if handler runs, dep succeeded.
 */
export type IsStepSkippable<
  TFlow extends AnyFlow,
  TStepSlug extends string
> = GetSkippableMode<TFlow, TStepSlug> extends 'skip' ? true : false;

// Helper types for StepInput with optional skippable deps
// Only 'skip' mode makes deps optional (dependents run with undefined value)
// 'skip-cascade' keeps deps required (dependents also skipped, so value guaranteed if running)
type RequiredDeps<TFlow extends AnyFlow, TStepSlug extends string> = {
  [K in Extract<
    keyof ExtractFlowSteps<TFlow>,
    StepDepsOf<TFlow, TStepSlug>
  > as GetSkippableMode<TFlow, K & string> extends 'skip'
    ? never
    : K]: ExtractFlowSteps<TFlow>[K];
};

type OptionalDeps<TFlow extends AnyFlow, TStepSlug extends string> = {
  [K in Extract<
    keyof ExtractFlowSteps<TFlow>,
    StepDepsOf<TFlow, TStepSlug>
  > as GetSkippableMode<TFlow, K & string> extends 'skip'
    ? K
    : never]?: ExtractFlowSteps<TFlow>[K];
};

/**
 * Asymmetric step input type:
 * - Root steps (no dependencies): receive flow input directly
 * - Dependent steps: receive only their dependencies (flow input available via context)
 *   - Skippable deps (whenUnmet/whenExhausted: 'skip') are optional
 *   - Cascade deps (whenUnmet/whenExhausted: 'skip-cascade') are required
 *     (because if handler runs, the dependency must have succeeded)
 *   - All other deps are required
 *
 * This enables functional composition where subflows can receive typed inputs
 * without the 'run' wrapper that previously blocked type matching.
 */
export type StepInput<
  TFlow extends AnyFlow,
  TStepSlug extends string
> = StepDepsOf<TFlow, TStepSlug> extends never
  ? ExtractFlowInput<TFlow> // Root step: flow input directly
  : Simplify<RequiredDeps<TFlow, TStepSlug> & OptionalDeps<TFlow, TStepSlug>>;

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
export interface FlowContext<
  TEnv extends Env = Env,
  TFlowInput extends AnyInput = AnyInput
> extends BaseContext<TEnv> {
  stepTask: StepTaskRecord<AnyFlow>;
  flowInput: Promise<TFlowInput>;
}

// Generic context type helper (uses FlowContext for flow handlers)
export type Context<
  T extends Record<string, unknown> = Record<string, never>,
  TEnv extends Env = Env
> = FlowContext<TEnv> & T;

/**
 * Options for handling unmet conditions (when 'if' pattern doesn't match input)
 *
 * @example
 * // Fail the step (and run) when pattern doesn't match
 * { if: { enabled: true }, whenUnmet: 'fail' }
 *
 * @example
 * // Skip this step only when pattern doesn't match
 * { if: { enabled: true }, whenUnmet: 'skip' }
 *
 * @example
 * // Skip this step and all dependents when pattern doesn't match
 * { if: { enabled: true }, whenUnmet: 'skip-cascade' }
 *
 * @remarks
 * - `'fail'`: When pattern doesn't match, step fails -> run fails (default)
 * - `'skip'`: When pattern doesn't match, skip step and continue (step key omitted from dependent inputs)
 * - `'skip-cascade'`: When pattern doesn't match, skip step + mark all dependents as skipped
 */
export type WhenUnmetMode = 'fail' | 'skip' | 'skip-cascade';

/**
 * Options for handling errors after all retries are exhausted
 *
 * @example
 * // Fail the run after retries exhausted (default)
 * { whenExhausted: 'fail' }
 *
 * @example
 * // Skip this step after retries exhausted, continue run
 * { whenExhausted: 'skip' }
 *
 * @example
 * // Skip this step and all dependents after retries exhausted
 * { whenExhausted: 'skip-cascade' }
 *
 * @remarks
 * - `'fail'`: Step fails -> run fails (default behavior)
 * - `'skip'`: Mark step as skipped, continue run (step key omitted from dependent inputs)
 * - `'skip-cascade'`: Skip step + mark all dependents as skipped too
 *
 * @note
 * TYPE_VIOLATION errors (e.g., single step returns non-array for map dependent)
 * are NOT subject to whenExhausted - these always hard fail as they indicate
 * programming errors, not runtime conditions.
 */
export type WhenExhaustedMode = 'fail' | 'skip' | 'skip-cascade';

/**
 * Helper type for dependent step handlers - creates deps object with correct optionality.
 * Only steps with 'skip' mode (not 'skip-cascade') make deps optional.
 * With 'skip-cascade', dependents are also skipped at runtime, so if handler runs, dep succeeded.
 */
type DepsWithOptionalSkippable<
  TSteps extends AnySteps,
  TDeps extends string
> = {
  // Required deps: either not skippable or skip-cascade (cascade skips dependents, so value guaranteed)
  [K in TDeps as K extends keyof TSteps
    ? TSteps[K]['skippable'] extends 'skip'
      ? never
      : K
    : K]: K extends keyof TSteps ? TSteps[K]['output'] : never;
} & {
  // Optional deps: only 'skip' mode (dependents run with undefined value)
  [K in TDeps as K extends keyof TSteps
    ? TSteps[K]['skippable'] extends 'skip'
      ? K
      : never
    : never]?: K extends keyof TSteps ? TSteps[K]['output'] : never;
};

// Step runtime options interface that extends flow options with step-specific options
// Note: 'if' is typed as Json here for internal storage; overloads provide type safety
export interface StepRuntimeOptions extends RuntimeOptions {
  startDelay?: number;

  /**
   * Pattern to match using PostgreSQL's @> (contains) operator
   *
   * @example
   * // Root step: match against flow input
   * { if: { role: 'admin', active: true } }
   *
   * @example
   * // Dependent step: match against dependency outputs
   * { if: { prevStep: { status: 'success' } } }
   *
   * @remarks
   * - Primitives: exact value match
   * - Objects: all keys optional, recursively applied
   * - Arrays: elements expected to be present in target array
   *
   * @see WhenUnmetMode for controlling what happens when pattern doesn't match
   */
  if?: Json;

  /**
   * Negative pattern - step executes when input does NOT match this pattern
   *
   * @example
   * // Root step: execute when NOT an admin
   * { ifNot: { role: 'admin' } }
   *
   * @example
   * // Combined with 'if' for AND semantics: "active admin who is NOT suspended"
   * { if: { role: 'admin', active: true }, ifNot: { suspended: true } }
   *
   * @remarks
   * - Uses PostgreSQL's @> containment check, negated
   * - When combined with 'if', BOTH must pass (AND semantics)
   * - For mutual exclusion: use same pattern with if on one step, ifNot on another
   *
   * @see WhenUnmetMode for controlling what happens when condition not met
   */
  ifNot?: Json;

  /**
   * What to do when the 'if' pattern doesn't match the input
   *
   * @default 'skip'
   *
   * @example
   * { whenUnmet: 'fail' }        // Pattern doesn't match -> step fails -> run fails
   * { whenUnmet: 'skip' }        // Pattern doesn't match -> skip step, continue run
   * { whenUnmet: 'skip-cascade' } // Pattern doesn't match -> skip step + all dependents
   *
   * @see WhenUnmetMode for detailed documentation of each mode
   */
  whenUnmet?: WhenUnmetMode;

  /**
   * What to do when handler throws an error after all retries are exhausted
   *
   * @default 'fail'
   *
   * @example
   * { whenExhausted: 'fail' }        // Step fails -> run fails
   * { whenExhausted: 'skip' }        // Skip step, continue run
   * { whenExhausted: 'skip-cascade' } // Skip step + all dependents
   *
   * @remarks
   * Only applies after maxAttempts retries are exhausted.
   * TYPE_VIOLATION errors always fail regardless of this setting.
   *
   * @see WhenExhaustedMode for detailed documentation of each mode
   */
  whenExhausted?: WhenExhaustedMode;
}

// Base runtime options without condition-related fields
interface BaseStepRuntimeOptions extends RuntimeOptions {
  startDelay?: number;
  whenExhausted?: WhenExhaustedMode;
}

/**
 * Condition with 'if' required (ifNot optional) - allows whenUnmet.
 * whenUnmet only makes sense when there's a condition to be "unmet".
 */
type WithIfCondition<T> = {
  if: ContainmentPattern<T>;
  ifNot?: ContainmentPattern<T>;
  whenUnmet?: WhenUnmetMode;
};

/**
 * Condition with 'ifNot' required (if optional) - allows whenUnmet.
 */
type WithIfNotCondition<T> = {
  if?: ContainmentPattern<T>;
  ifNot: ContainmentPattern<T>;
  whenUnmet?: WhenUnmetMode;
};

/**
 * No condition - if, ifNot, and whenUnmet are all forbidden.
 * This ensures whenUnmet can only be used with a condition.
 */
type WithoutCondition = {
  if?: never;
  ifNot?: never;
  whenUnmet?: never;
};

/**
 * Discriminated union for condition options.
 * whenUnmet is only allowed when if or ifNot is provided.
 */
type ConditionOpts<T> =
  | WithIfCondition<T>
  | WithIfNotCondition<T>
  | WithoutCondition;

// Typed step options for root steps (if/ifNot match FlowInput pattern)
export type RootStepOptions<TFlowInput> = BaseStepRuntimeOptions &
  ConditionOpts<TFlowInput>;

// Typed step options for dependent steps (if/ifNot match deps object pattern)
export type DependentStepOptions<TDeps> = BaseStepRuntimeOptions &
  ConditionOpts<TDeps>;

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
   *   - Skippable deps are optional, required deps are required
   *
   * @throws Error if the step with the given slug doesn't exist
   */
  getStepDefinition<SlugType extends keyof Steps & keyof StepDependencies>(
    slug: SlugType
  ): StepDefinition<
    StepDependencies[SlugType] extends [] | readonly []
      ? TFlowInput // Root step: flow input directly
      : Simplify<
          {
            [K in StepDependencies[SlugType][number] as K extends keyof Steps
              ? Steps[K]['skippable'] extends true
                ? never
                : K
              : never]: K extends keyof Steps ? Steps[K]['output'] : never;
          } & {
            [K in StepDependencies[SlugType][number] as K extends keyof Steps
              ? Steps[K]['skippable'] extends true
                ? K
                : never
              : never]?: K extends keyof Steps ? Steps[K]['output'] : never;
          }
        >, // Dependent step: only deps (skippable deps optional)
    Steps[SlugType]['output'],
    FlowContext<TEnv, TFlowInput> & TContext
  > {
    // Check if the slug exists in stepDefinitions using a more explicit pattern
    if (!(slug in this.stepDefinitions)) {
      throw new Error(
        `Step "${String(slug)}" does not exist in flow "${this.slug}"`
      );
    }

    return this.stepDefinitions[slug as string];
  }

  // Overload 1: Root step (no dependsOn) - receives flowInput directly
  // if is typed as ContainmentPattern<TFlowInput>
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  step<
    Slug extends string,
    TOutput,
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        dependsOn?: never;
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | (WithIfNotCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: (
      flowInput: TFlowInput,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        Awaited<TOutput>,
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload 2: Dependent step (with dependsOn) - receives deps, flowInput via context
  // if is typed as ContainmentPattern<DepsObject>
  // Note: [Deps, ...Deps[]] requires at least one dependency - empty arrays are rejected at compile time
  // Handler receives deps with correct optionality based on upstream steps' skippability
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  step<
    Slug extends string,
    Deps extends Extract<keyof Steps, string>,
    TOutput,
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        dependsOn: [Deps, ...Deps[]];
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<Simplify<DepsWithOptionalSkippable<Steps, Deps>>> & {
            whenUnmet?: TWhenUnmet;
          })
        | (WithIfNotCondition<
            Simplify<DepsWithOptionalSkippable<Steps, Deps>>
          > & { whenUnmet?: TWhenUnmet })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: (
      deps: Simplify<DepsWithOptionalSkippable<Steps, Deps>>,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        Awaited<TOutput>,
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
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
    if (opts.if !== undefined) options.if = opts.if;
    if (opts.ifNot !== undefined) options.ifNot = opts.ifNot;
    if (opts.whenUnmet !== undefined) options.whenUnmet = opts.whenUnmet;
    if (opts.whenExhausted !== undefined)
      options.whenExhausted = opts.whenExhausted;

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
  // if is typed as ContainmentPattern<TFlowInput>
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  array<
    Slug extends string,
    TOutput extends readonly any[],
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        dependsOn?: never;
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | (WithIfNotCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: (
      flowInput: TFlowInput,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        Awaited<TOutput>,
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload 2: Dependent array (with dependsOn) - receives deps, flowInput via context
  // if is typed as ContainmentPattern<DepsObject>
  // Note: [Deps, ...Deps[]] requires at least one dependency - empty arrays are rejected at compile time
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  array<
    Slug extends string,
    Deps extends Extract<keyof Steps, string>,
    TOutput extends readonly any[],
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        dependsOn: [Deps, ...Deps[]];
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<Simplify<DepsWithOptionalSkippable<Steps, Deps>>> & {
            whenUnmet?: TWhenUnmet;
          })
        | (WithIfNotCondition<
            Simplify<DepsWithOptionalSkippable<Steps, Deps>>
          > & { whenUnmet?: TWhenUnmet })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: (
      deps: Simplify<DepsWithOptionalSkippable<Steps, Deps>>,
      context: FlowContext<TEnv, TFlowInput> & TContext
    ) => TOutput | Promise<TOutput>
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        Awaited<TOutput>,
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
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
  // if is typed as ContainmentPattern<TFlowInput> (checks the array itself)
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  map<
    Slug extends string,
    THandler extends TFlowInput extends readonly (infer Item)[]
      ? (
          item: Item,
          context: FlowContext<TEnv, TFlowInput> & TContext
        ) => Json | Promise<Json>
      : never,
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | (WithIfNotCondition<TFlowInput> & { whenUnmet?: TWhenUnmet })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        AwaitedReturn<THandler>[],
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
    StepDependencies & { [K in Slug]: [] },
    TEnv
  >;

  // Overload for dependent map - handler receives item, context includes flowInput
  // if is typed as ContainmentPattern<{ arrayDep: ArrayOutput }> (checks the dep object)
  // whenUnmet is only allowed when if or ifNot is provided (enforced by ConditionOpts union)
  map<
    Slug extends string,
    TArrayDep extends Extract<keyof Steps, string>,
    THandler extends Steps[TArrayDep]['output'] extends readonly (infer Item)[]
      ? (
          item: Item,
          context: FlowContext<TEnv, TFlowInput> & TContext
        ) => Json | Promise<Json>
      : never,
    TWhenUnmet extends WhenUnmetMode | undefined = undefined,
    TRetries extends WhenExhaustedMode | undefined = undefined
  >(
    opts: Simplify<
      {
        slug: Slug extends keyof Steps ? never : Slug;
        array: TArrayDep;
        whenExhausted?: TRetries;
      } & (
        | (WithIfCondition<{ [K in TArrayDep]: Steps[K]['output'] }> & {
            whenUnmet?: TWhenUnmet;
          })
        | (WithIfNotCondition<{ [K in TArrayDep]: Steps[K]['output'] }> & {
            whenUnmet?: TWhenUnmet;
          })
        | WithoutCondition
      ) &
        Omit<BaseStepRuntimeOptions, 'whenExhausted'>
    >,
    handler: THandler
  ): Flow<
    TFlowInput,
    TContext,
    Steps & {
      [K in Slug]: StepMeta<
        AwaitedReturn<THandler>[],
        TWhenUnmet extends 'skip' | 'skip-cascade'
          ? TWhenUnmet
          : TRetries extends 'skip' | 'skip-cascade'
          ? TRetries
          : false
      >;
    },
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
        throw new Error(
          `Step "${slug}" depends on undefined step "${arrayDep}"`
        );
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
    if (opts.if !== undefined) options.if = opts.if;
    if (opts.ifNot !== undefined) options.ifNot = opts.ifNot;
    if (opts.whenUnmet !== undefined) options.whenUnmet = opts.whenUnmet;
    if (opts.whenExhausted !== undefined)
      options.whenExhausted = opts.whenExhausted;

    // Validate runtime options
    validateRuntimeOptions(options, { optional: true });

    // Create the map step definition with stepType
    // Note: We use AnyInput/AnyOutput here because the actual types are handled at the type level via overloads
    const newStepDefinition: StepDefinition<
      AnyInput,
      AnyOutput,
      BaseContext & TContext
    > = {
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
