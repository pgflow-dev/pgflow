import { AnyFlow } from './dsl.js';

// ========================
// SHAPE TYPE DEFINITIONS
// ========================

/**
 * StepShape captures the structural definition of a step for drift detection.
 *
 * NOTE: Runtime options (maxAttempts, baseDelay, timeout, startDelay) are
 * intentionally excluded. These can be tuned at runtime via SQL without
 * requiring recompilation. See: /deploy/tune-flow-config/
 */
export interface StepShape {
  slug: string;
  stepType: 'single' | 'map';
  dependencies: string[]; // sorted alphabetically for deterministic comparison
}

/**
 * FlowShape captures the structural definition of a flow for drift detection.
 *
 * This represents the DAG topology - which steps exist, their types, and how
 * they connect via dependencies. Runtime configuration options are intentionally
 * excluded as they can be tuned in production without recompilation.
 *
 * Note: flowSlug is intentionally excluded - it's an identifier, not structural
 * data. The slug comes from context (URL, registry lookup, function parameter).
 */
export interface FlowShape {
  steps: StepShape[];
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
 * Extracts a FlowShape from a Flow object.
 * The shape captures structural information needed for drift detection.
 *
 * NOTE: Runtime options are intentionally not included in the shape.
 * They can be tuned at runtime via SQL without triggering recompilation.
 *
 * @param flow - The Flow object to extract shape from
 * @returns A FlowShape representing the flow's structure
 */
export function extractFlowShape(flow: AnyFlow): FlowShape {
  const steps: StepShape[] = flow.stepOrder.map((stepSlug) => {
    const stepDef = flow.getStepDefinition(stepSlug);

    return {
      slug: stepSlug,
      stepType: stepDef.stepType ?? 'single',
      // Sort dependencies alphabetically for deterministic comparison
      dependencies: [...stepDef.dependencies].sort(),
    };
  });

  return { steps };
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
      differences.push(`Step at index ${i}: missing in first shape (second has '${bStep.slug}')`);
    } else if (!bStep) {
      differences.push(`Step at index ${i}: missing in second shape (first has '${aStep.slug}')`);
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
      `Step at index ${index}: dependencies differ [${a.dependencies.join(', ')}] vs [${b.dependencies.join(', ')}]`
    );
  }
}
