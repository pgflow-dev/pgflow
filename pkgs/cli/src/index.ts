import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import installCommand from './commands/install/index.js';

// Create a function to handle errors
const errorHandler = (error: unknown) => {
  console.error(
    'Error:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
};

// Set up process-wide unhandled rejection handler
process.on('unhandledRejection', errorHandler);

// Function to get version from package.json
function getVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '..', 'package.json');

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    // Log error but don't display it to the user when showing version
    console.error('Error reading package.json:', error);
    return 'unknown';
  }
}

const program = new Command();
program
  .version(getVersion(), '-V, --version', 'Output the current version')
  .exitOverride((err) => {
    // Don't treat version display as an error
    if (err.code === 'commander.version') {
      process.exit(0);
    }
    throw err;
  });

installCommand(program);

// Use a promise-aware approach to parse arguments
async function main() {
  try {
    await program.parseAsync(process.argv);
    // If we get here with no command specified, it's not an error
    process.exitCode = 0;
  } catch (err) {
    // Commander throws a CommanderError when help or version is displayed
    // We want to exit with code 0 in these cases
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.help' ||
        err.code === 'commander.version')
    ) {
      process.exitCode = 0;
    } else {
      // For other errors, use our error handler
      errorHandler(err);
    }
  }
}

// Execute and handle any errors
main();
