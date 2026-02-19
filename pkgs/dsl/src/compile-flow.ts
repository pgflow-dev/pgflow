import { AnyFlow, RuntimeOptions, StepRuntimeOptions } from './dsl.js';

/**
 * Compiles a Flow object into an array of SQL statements
 * that can be executed to create the flow and its steps in PostgreSQL
 *
 * @param flow The Flow object to compile
 * @returns Array of SQL statements
 */
export function compileFlow(flow: AnyFlow): string[] {
  const statements: string[] = [];
  const escapedFlowSlug = escapeSqlLiteral(flow.slug);

  // Create the flow
  const flowOptions = formatRuntimeOptions(flow.options);
  statements.push(
    `SELECT pgflow.create_flow('${escapedFlowSlug}'${flowOptions});`
  );

  // Add steps in the order they were defined
  for (const stepSlug of flow.stepOrder) {
    const step = flow.getStepDefinition(stepSlug);
    const stepOptions = formatRuntimeOptions(step.options);

    // Format dependencies array if it exists
    let depsClause = '';
    if (step.dependencies.length > 0) {
      const depsArray = step.dependencies
        .map((dep) => `'${escapeSqlLiteral(dep)}'`)
        .join(', ');
      depsClause = `, ARRAY[${depsArray}]`;
    }

    // Add step_type parameter for map steps
    let stepTypeClause = '';
    if (step.stepType === 'map') {
      stepTypeClause = `, step_type => 'map'`;
    }

    statements.push(
      `SELECT pgflow.add_step('${escapedFlowSlug}', '${escapeSqlLiteral(
        step.slug
      )}'${depsClause}${stepOptions}${stepTypeClause});`
    );
  }

  return statements;
}

/**
 * Formats runtime options into SQL parameter string
 */
function formatRuntimeOptions(
  options: RuntimeOptions | StepRuntimeOptions
): string {
  const parts: string[] = [];

  if (options.maxAttempts !== undefined) {
    parts.push(`max_attempts => ${options.maxAttempts}`);
  }

  if (options.baseDelay !== undefined) {
    parts.push(`base_delay => ${options.baseDelay}`);
  }

  if (options.timeout !== undefined) {
    parts.push(`timeout => ${options.timeout}`);
  }

  if ('startDelay' in options && options.startDelay !== undefined) {
    parts.push(`start_delay => ${options.startDelay}`);
  }

  if ('if' in options && options.if !== undefined) {
    const jsonStr = JSON.stringify(options.if);
    parts.push(`required_input_pattern => '${escapeSqlLiteral(jsonStr)}'`);
  }

  if ('ifNot' in options && options.ifNot !== undefined) {
    const jsonStr = JSON.stringify(options.ifNot);
    parts.push(`forbidden_input_pattern => '${escapeSqlLiteral(jsonStr)}'`);
  }

  if ('whenUnmet' in options && options.whenUnmet !== undefined) {
    parts.push(`when_unmet => '${escapeSqlLiteral(options.whenUnmet)}'`);
  }

  if ('whenExhausted' in options && options.whenExhausted !== undefined) {
    parts.push(
      `when_exhausted => '${escapeSqlLiteral(options.whenExhausted)}'`
    );
  }

  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
