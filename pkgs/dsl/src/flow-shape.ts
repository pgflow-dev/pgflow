import { AnyFlow, WhenUnmetMode, RetriesExhaustedMode } from './dsl.js';

// ========================
// SHAPE TYPE DEFINITIONS
// ========================

/**
 * Step-level options that can be included in the shape for creation,
 * but are NOT compared during shape comparison (runtime tunable).
 */
export interface StepShapeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
  startDelay?: number;
}

/**
 * Flow-level options that can be included in the shape for creation,
 * but are NOT compared during shape comparison (runtime tunable).
 */
export interface FlowShapeOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}

/**
 * StepShape captures the structural definition of a step for drift detection.
 *
 * The `options` field is included for flow creation but NOT compared during
 * shape comparison. Options can be tuned at runtime via SQL without
 * requiring recompilation. See: /deploy/tune-flow-config/
 *
 * `whenUnmet` and `whenFailed` ARE structural - they affect DAG execution
 * semantics and must match between worker and database.
 */
export interface StepShape {
  slug: string;
  stepType: 'single' | 'map';
  dependencies: string[]; // sorted alphabetically for deterministic comparison
  whenUnmet: WhenUnmetMode;
  whenFailed: RetriesExhaustedMode;
  options?: StepShapeOptions;
}

/**
 * FlowShape captures the structural definition of a flow for drift detection.
 *
 * This represents the DAG topology - which steps exist, their types, and how
 * they connect via dependencies.
 *
 * The `options` field is included for flow creation but NOT compared during
 * shape comparison. Options can be tuned at runtime via SQL without recompilation.
 *
 * Note: flowSlug is intentionally excluded - it's an identifier, not structural
 * data. The slug comes from context (URL, registry lookup, function parameter).
 */
export interface FlowShape {
  steps: StepShape[];
  options?: FlowShapeOptions;
}

/**
 * Result of comparing two FlowShapes.
 */
export interface ShapeComparisonResult {
  match: boolean;
  differences: string[];
}

// ========================
// SHAPE EXTRACTION
// ========================

/**
 * Checks if an options object has any defined (non-undefined) values.
 */
function hasDefinedOptions(options: Record<string, unknown>): boolean {
  return Object.values(options).some((v) => v !== undefined);
}

/**
 * Filters out undefined values from an options object.
 * Returns only the keys with defined values.
 */
function filterDefinedOptions<T extends Record<string, unknown>>(
  options: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(options).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Extracts a FlowShape from a Flow object.
 * The shape captures structural information needed for drift detection,
 * plus options for flow creation.
 *
 * Options are included in the shape for proper flow/step creation, but
 * are NOT compared during shape comparison (they're runtime tunable).
 *
 * @param flow - The Flow object to extract shape from
 * @returns A FlowShape representing the flow's structure and options
 */
export function extractFlowShape(flow: AnyFlow): FlowShape {
  const steps: StepShape[] = flow.stepOrder.map((stepSlug) => {
    const stepDef = flow.getStepDefinition(stepSlug);

    const stepShape: StepShape = {
      slug: stepSlug,
      stepType: stepDef.stepType ?? 'single',
      // Sort dependencies alphabetically for deterministic comparison
      dependencies: [...stepDef.dependencies].sort(),
      // Condition modes are structural - they affect DAG execution semantics
      whenUnmet: stepDef.options.whenUnmet ?? 'skip',
      whenFailed: stepDef.options.retriesExhausted ?? 'fail',
    };

    // Only include options if at least one is defined
    const stepOptions = {
      maxAttempts: stepDef.options.maxAttempts,
      baseDelay: stepDef.options.baseDelay,
      timeout: stepDef.options.timeout,
      startDelay: stepDef.options.startDelay,
    };

    if (hasDefinedOptions(stepOptions)) {
      stepShape.options = filterDefinedOptions(stepOptions);
    }

    return stepShape;
  });

  const shape: FlowShape = { steps };

  // Only include flow options if at least one is defined
  const flowOptions = {
    maxAttempts: flow.options.maxAttempts,
    baseDelay: flow.options.baseDelay,
    timeout: flow.options.timeout,
  };

  if (hasDefinedOptions(flowOptions)) {
    shape.options = filterDefinedOptions(flowOptions);
  }

  return shape;
}

// ========================
// SHAPE COMPARISON
// ========================

/**
 * Compares two FlowShapes and returns detailed differences.
 * Used by ControlPlane for Layer 1 comparison (Worker vs ControlPlane).
 *
 * Only compares structural aspects (steps, types, dependencies).
 * Runtime options are not compared as they can be tuned independently.
 *
 * @param a - First FlowShape (typically from worker)
 * @param b - Second FlowShape (typically from ControlPlane or database)
 * @returns ShapeComparisonResult with match status and list of differences
 */
export function compareFlowShapes(
  a: FlowShape,
  b: FlowShape
): ShapeComparisonResult {
  const differences: string[] = [];

  // Compare step counts
  if (a.steps.length !== b.steps.length) {
    differences.push(
      `Step count differs: ${a.steps.length} vs ${b.steps.length}`
    );
  }

  // Compare steps by index (order matters)
  const maxLen = Math.max(a.steps.length, b.steps.length);
  for (let i = 0; i < maxLen; i++) {
    const aStep = a.steps[i];
    const bStep = b.steps[i];

    if (!aStep) {
      differences.push(
        `Step at index ${i}: missing in first shape (second has '${bStep.slug}')`
      );
    } else if (!bStep) {
      differences.push(
        `Step at index ${i}: missing in second shape (first has '${aStep.slug}')`
      );
    } else {
      compareSteps(aStep, bStep, i, differences);
    }
  }

  return {
    match: differences.length === 0,
    differences,
  };
}

/**
 * Compares two steps at the same index and adds differences to the list.
 */
function compareSteps(
  a: StepShape,
  b: StepShape,
  index: number,
  differences: string[]
): void {
  // Compare slug (order matters, so slugs must match at same index)
  if (a.slug !== b.slug) {
    differences.push(
      `Step at index ${index}: slug differs '${a.slug}' vs '${b.slug}'`
    );
  }

  // Compare step type
  if (a.stepType !== b.stepType) {
    differences.push(
      `Step at index ${index}: type differs '${a.stepType}' vs '${b.stepType}'`
    );
  }

  // Compare dependencies (already sorted)
  const aDeps = a.dependencies.join(',');
  const bDeps = b.dependencies.join(',');
  if (aDeps !== bDeps) {
    differences.push(
      `Step at index ${index}: dependencies differ [${a.dependencies.join(
        ', '
      )}] vs [${b.dependencies.join(', ')}]`
    );
  }

  // Compare condition modes (structural - affects DAG execution semantics)
  if (a.whenUnmet !== b.whenUnmet) {
    differences.push(
      `Step at index ${index}: whenUnmet differs '${a.whenUnmet}' vs '${b.whenUnmet}'`
    );
  }

  if (a.whenFailed !== b.whenFailed) {
    differences.push(
      `Step at index ${index}: whenFailed differs '${a.whenFailed}' vs '${b.whenFailed}'`
    );
  }
}
