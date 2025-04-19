import { AnyFlow, RuntimeOptions } from './dsl.js';

/**
 * Compiles a Flow object into an array of SQL statements
 * that can be executed to create the flow and its steps in PostgreSQL
 *
 * @param flow The Flow object to compile
 * @returns Array of SQL statements
 */
export function compileFlow(flow: AnyFlow): string[] {
  const statements: string[] = [];

  // Create the flow
  const flowOptions = formatRuntimeOptions(flow.options);
  statements.push(`SELECT pgflow.create_flow('${flow.slug}'${flowOptions});`);

  // Add steps in the order they were defined
  for (const stepSlug of flow.stepOrder) {
    const step = flow.getStepDefinition(stepSlug);
    const stepOptions = formatRuntimeOptions(step.options);

    // Format dependencies array if it exists
    let depsClause = '';
    if (step.dependencies.length > 0) {
      const depsArray = step.dependencies.map((dep) => `'${dep}'`).join(', ');
      depsClause = `, ARRAY[${depsArray}]`;
    }

    statements.push(
      `SELECT pgflow.add_step('${flow.slug}', '${step.slug}'${depsClause}${stepOptions});`
    );
  }

  return statements;
}

/**
 * Formats runtime options into SQL parameter string
 */
function formatRuntimeOptions(options: RuntimeOptions): string {
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

  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}
