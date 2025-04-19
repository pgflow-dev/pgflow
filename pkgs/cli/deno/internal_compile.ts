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

  // Import the compileFlow function from pgflow DSL
  // The import map in deno.json will resolve this import
  const dslModule = await import('npm:@pgflow/dsl@0.1.1');

  // Compile the flow to SQL
  const flow = flowModule.default;

  // Check if compileFlow exists in the module
  if (typeof dslModule.compileFlow !== 'function') {
    console.error('Error: compileFlow function not found in @pgflow/dsl');
    console.error('Available exports:', Object.keys(dslModule));
    Deno.exit(1);
  }

  const sqlStatements = dslModule.compileFlow(flow);

  // Output the SQL statements to stdout
  console.log(sqlStatements.join('\n'));
} catch (error) {
  console.error(`Error compiling flow: ${error.message}`);
  Deno.exit(1);
}
