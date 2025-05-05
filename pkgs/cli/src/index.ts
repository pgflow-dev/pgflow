#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import installCommand from './commands/install/index.js';
import compileCommand from './commands/compile/index.js';

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
  .name('npx pgflow')
  .description('Command line interface to help you work with pgflow')
  .version(getVersion())
  .exitOverride((err) => {
    // Don't treat version display as an error
    if (err.code === 'commander.version') {
      process.exit(0);
    }
    throw err;
  });

// Register commands
installCommand(program);
compileCommand(program);

import chalk from 'chalk';
// Tokyo Night inspired colors
// const p = chalk.hex('#7aa2f7'); // blue-violet
const g = chalk.hex('#9ece6a'); // vibrant green
const f = chalk.hex('#bb9af7'); // light purple/pink
const l = chalk.hex('#2ac3de'); // bright teal/cyan
// const o = chalk.hex('#ff9e64'); // orange
// const w = chalk.hex('#f7768e'); // magenta/pink
const banner = [
  `                ${l('__ _')}                 `,
  `   ${g('_ __   __ _')} ${l('/ _| | _____      __')}  `,
  `  ${g("| '_ \\ / _'")} ${l('| |_| |/ _ \\ \\ /\\ / /')}  `,
  `  ${g('| |_) | (_|')} ${l('|  _| | (_) \\ V  V /')}   `,
  `  ${g('| .__/ \\__,')} ${l('|_| |_|\\___/ \\_/\\_/')}    `,
  `  ${g('|_|    |___/')}`,
].join('\n');

console.log(banner);
console.log();
console.log();
console.log();

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
