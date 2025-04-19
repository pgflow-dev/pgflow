/**
 * internal_compile.ts
 *
 * This script is executed by Deno to compile a Flow into SQL statements.
 * It takes a path to a flow file as an argument, imports the default export,
 * and passes it to compileFlow() from the DSL package.
 */

// Get the flow file path from command line arguments
const flowFilePath = Deno.args[0];

if (!flowFilePath) {
  console.error('Error: No flow file path provided');
  Deno.exit(1);
}

try {
  // Dynamically import the flow file
  const flowModule = await import(`file://${flowFilePath}`);

  // Check if there's a default export
  if (!flowModule.default) {
    console.error(`Error: No default export found in ${flowFilePath}`);
    Deno.exit(1);
  }

  // Import the DSL module
  // The import map in deno.json will resolve this import
  const dslModule = await import('npm:@pgflow/dsl');

  // Debug available exports
  console.error('Available exports from @pgflow/dsl:', Object.keys(dslModule));

  // Get the flow instance
  const flow = flowModule.default;

  let compileFlow;
  let sqlStatements;

  // Try different ways to access the compileFlow function
  if (typeof dslModule.compileFlow === 'function') {
    // Direct export
    compileFlow = dslModule.compileFlow;
  } else if (
    dslModule.default &&
    typeof dslModule.default.compileFlow === 'function'
  ) {
    // Default export with compileFlow as a property
    compileFlow = dslModule.default.compileFlow;
  } else {
    // Try to import the compile-flow module directly
    try {
      const compileFlowModule = await import(
        'npm:@pgflow/dsl/dist/compile-flow.js'
      );
      if (typeof compileFlowModule.compileFlow === 'function') {
        compileFlow = compileFlowModule.compileFlow;
      } else if (
        compileFlowModule.default &&
        typeof compileFlowModule.default === 'function'
      ) {
        compileFlow = compileFlowModule.default;
      }
    } catch (importError) {
      console.error(
        'Failed to import compile-flow module:',
        importError.message
      );

      // Try another path
      try {
        const altModule = await import('npm:@pgflow/dsl/src/compile-flow.js');
        if (typeof altModule.compileFlow === 'function') {
          compileFlow = altModule.compileFlow;
        } else if (
          altModule.default &&
          typeof altModule.default === 'function'
        ) {
          compileFlow = altModule.default;
        }
      } catch (altError) {
        console.error(
          'Failed to import alternative compile-flow module:',
          altError.message
        );
      }
    }
  }

  // Check if we found a valid compileFlow function
  if (typeof compileFlow !== 'function') {
    console.error('Error: compileFlow function not found in @pgflow/dsl');
    console.error('Available exports:', Object.keys(dslModule));
    Deno.exit(1);
  }

  // Compile the flow to SQL
  sqlStatements = compileFlow(flow);

  // Output the SQL statements to stdout
  console.log(sqlStatements.join('\n'));
} catch (error) {
  console.error(`Error compiling flow: ${error.message}`);
  Deno.exit(1);
}
