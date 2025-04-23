/**
 * internal_compile.js
 *
 * This script is executed by Deno to compile a Flow into SQL statements.
 * It takes a path to a flow file as an argument, imports the default export,
 * and passes it to compileFlow() from the DSL package.
 */

// Import the compileFlow function directly from @pgflow/dsl
// The import map in deno.json will resolve this import
import { compileFlow } from 'npm:@pgflow/dsl';

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

  // Get the flow instance
  const flow = flowModule.default;

  // Compile the flow to SQL
  const sqlStatements = compileFlow(flow);

  // Output the SQL statements to stdout
  console.log(sqlStatements.join('\n'));
} catch (error) {
  console.error(`Error compiling flow: ${error.message}`);

  // If the error is related to importing compileFlow, provide more detailed error
  if (error.message.includes('@pgflow/dsl')) {
    console.error(
      'Failed to import compileFlow from @pgflow/dsl. This might be due to:'
    );
    console.error(
      '1. The function not being exported correctly from the package'
    );
    console.error('2. A version mismatch between the CLI and DSL packages');
    console.error('3. Issues with the Deno import map configuration');
  }

  Deno.exit(1);
}
