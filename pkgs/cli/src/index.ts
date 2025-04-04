import { Command } from 'commander';

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

const program = new Command();

program.exitOverride();

export const installSubcommand = program
  .command('install')
  .description('Installs pgflow migration and worker edge function')
  .argument('<supabase-path>', 'Path to supabase project')
  .action(async (supabasePath: string) => {
    try {
      console.log(`Installing pgflow into ${supabasePath}`);
      // Any async operations would go here
    } catch (error) {
      errorHandler(error);
    }
  });

// Use a promise-aware approach to parse arguments
async function main() {
  try {
    await program.parseAsync(process.argv);
    // If we get here with no command specified, it's not an error
    process.exitCode = 0;
  } catch (err) {
    // Commander throws a CommanderError when help is displayed
    // We want to exit with code 0 in this case
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err.code === 'commander.helpDisplayed' || err.code === 'commander.help')
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
