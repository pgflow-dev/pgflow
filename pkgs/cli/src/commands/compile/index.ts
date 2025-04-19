import { type Command } from 'commander';
import chalk from 'chalk';
import { intro, log, spinner, note } from '@clack/prompts';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Formats a command and its arguments for display with syntax highlighting
 * Each argument is displayed on a separate line for better readability
 */
function formatCommand(command: string, args: string[]): string {
  const cmd = chalk.cyan(command);
  const formattedArgs = args.map((arg) => {
    // Highlight import map and file paths differently
    if (arg.startsWith('--import-map=')) {
      const [flag, value] = arg.split('=');
      return `  ${chalk.yellow(flag)}=${chalk.green(value)}`;
    } else if (arg.startsWith('--')) {
      return `  ${chalk.yellow(arg)}`;
    } else if (arg.endsWith('.ts') || arg.endsWith('.json')) {
      return `  ${chalk.green(arg)}`;
    }
    return `  ${chalk.white(arg)}`;
  });

  return `$ ${cmd}\n${formattedArgs.join('\n')}`;
}

export default (program: Command) => {
  program
    .command('compile')
    .description('Compiles a TypeScript-defined flow into SQL migration')
    .argument('<flowPath>', 'Path to the flow TypeScript file')
    .option(
      '--deno-json <denoJsonPath>',
      'Path to deno.json with valid importMap'
    )
    .action(async (flowPath, options) => {
      intro('pgflow - Compile Flow to SQL');

      try {
        // Resolve paths
        const resolvedFlowPath = path.resolve(process.cwd(), flowPath);

        // Only resolve denoJsonPath if it's provided
        let resolvedDenoJsonPath: string | undefined;
        if (options.denoJson) {
          resolvedDenoJsonPath = path.resolve(process.cwd(), options.denoJson);

          // Validate deno.json path if provided
          if (!fs.existsSync(resolvedDenoJsonPath)) {
            log.error(`deno.json file not found: ${resolvedDenoJsonPath}`);
            process.exit(1);
          }
        }

        // Validate flow path
        if (!fs.existsSync(resolvedFlowPath)) {
          log.error(`Flow file not found: ${resolvedFlowPath}`);
          process.exit(1);
        }

        // Find the internal_compile.ts script
        const internalCompileScript = path.resolve(
          __dirname,
          '../../../deno/internal_compile.ts'
        );

        // Create migrations directory if it doesn't exist
        const migrationsDir = path.resolve(process.cwd(), 'migrations');
        if (!fs.existsSync(migrationsDir)) {
          fs.mkdirSync(migrationsDir, { recursive: true });
          log.info(`Created migrations directory: ${migrationsDir}`);
        }

        // Generate timestamp for migration file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
        const migrationFileName = `pgflow_${timestamp}.sql`;
        const migrationFilePath = path.join(migrationsDir, migrationFileName);

        // Run the compilation
        const s = spinner();
        s.start(`Compiling flow: ${path.basename(resolvedFlowPath)}`);

        const compiledSql = await runDenoCompilation(
          internalCompileScript,
          resolvedFlowPath,
          resolvedDenoJsonPath
        );

        // Write the SQL to a migration file
        fs.writeFileSync(migrationFilePath, compiledSql);

        s.stop(`Successfully compiled flow to SQL`);
        log.success(`Migration file created: ${migrationFilePath}`);
      } catch (error) {
        log.error(
          `Compilation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exit(1);
      }
    });
};

/**
 * Runs the Deno compilation script and returns the compiled SQL
 */
async function runDenoCompilation(
  scriptPath: string,
  flowPath: string,
  denoJsonPath?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Validate input paths
    if (!scriptPath) {
      return reject(new Error('Internal script path is required'));
    }

    if (!flowPath) {
      return reject(new Error('Flow path is required'));
    }

    // Build the command arguments array
    const args = ['run', '--allow-read', '--allow-net', '--allow-env'];

    // Only add the import-map argument if denoJsonPath is provided and valid
    if (denoJsonPath && typeof denoJsonPath === 'string') {
      args.push(`--import-map=${denoJsonPath}`);
    }

    // Add the script path and flow path
    args.push(scriptPath, flowPath);

    // Log the command for debugging with colored output
    note(formatCommand('deno', args), 'Compile in Deno');

    const deno = spawn('deno', args);

    let stdout = '';
    let stderr = '';

    deno.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    deno.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    deno.on('close', (code) => {
      if (code === 0) {
        if (stdout.trim().length === 0) {
          reject(new Error('Compilation produced no output'));
        } else {
          resolve(stdout);
        }
      } else {
        reject(
          new Error(
            `Deno process exited with code ${code}${
              stderr ? `\n${stderr}` : ''
            }`
          )
        );
      }
    });

    deno.on('error', (err) => {
      reject(
        new Error(
          `Failed to start Deno process: ${err.message}. Make sure Deno is installed.`
        )
      );
    });
  });
}
