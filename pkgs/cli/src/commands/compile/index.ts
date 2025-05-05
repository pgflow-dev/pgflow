import { type Command } from 'commander';
import chalk from 'chalk';
import { intro, log, note } from '@clack/prompts';
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

/**
 * Creates a task log entry with a command and its output
 */
function createTaskLog(command: string, args: string[], output: string): string {
  return [
    chalk.bold("Command:"),
    formatCommand(command, args),
    "",
    chalk.bold("Output:"),
    output.trim() ? output.trim() : "(no output)",
  ].join("\n");
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
    .option('--supabase-path <supabasePath>', 'Path to the Supabase folder')
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

        // Validate Supabase path
        let supabasePath: string;
        if (options.supabasePath) {
          supabasePath = path.resolve(process.cwd(), options.supabasePath);
        } else {
          // Default to ./supabase/ if not provided
          supabasePath = path.resolve(process.cwd(), 'supabase');
        }

        // Check if Supabase path exists
        if (!fs.existsSync(supabasePath)) {
          log.error(
            `Supabase directory not found: ${supabasePath}\n` +
              `Please provide a valid Supabase path using --supabase-path option or ensure ./supabase/ directory exists.`
          );
          process.exit(1);
        }

        // Find the internal_compile.js script
        const internalCompileScript = path.resolve(
          __dirname,
          '../../deno/internal_compile.js'
        );

        // Create migrations directory if it doesn't exist
        const migrationsDir = path.resolve(supabasePath, 'migrations');
        if (!fs.existsSync(migrationsDir)) {
          fs.mkdirSync(migrationsDir, { recursive: true });
          log.success(`Created migrations directory: ${migrationsDir}`);
        }

        // Generate timestamp for migration file in format YYYYMMDDHHMMSS
        const now = new Date();
        const timestamp = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0'),
        ].join('');

        // Run the compilation
        log.info(`Compiling flow: ${path.basename(resolvedFlowPath)}`);
        const compiledSql = await runDenoCompilation(
          internalCompileScript,
          resolvedFlowPath,
          resolvedDenoJsonPath
        );
        
        // Extract flow name from the first line of the SQL output using regex
        // Looking for pattern: SELECT pgflow.create_flow('flow_name', ...);
        const flowNameMatch = compiledSql.match(/SELECT\s+pgflow\.create_flow\s*\(\s*'([^']+)'/i);
        
        // Use extracted flow name or fallback to the file basename if extraction fails
        let flowName;
        if (flowNameMatch && flowNameMatch[1]) {
          flowName = flowNameMatch[1];
          log.info(`Extracted flow name: ${flowName}`);
        } else {
          // Fallback to file basename if regex doesn't match
          flowName = path.basename(resolvedFlowPath, path.extname(resolvedFlowPath));
          log.warn(`Could not extract flow name from SQL, using file basename: ${flowName}`);
        }

        // Create migration filename in the format: <timestamp>_create_<flow_name>_flow.sql
        const migrationFileName = `${timestamp}_create_${flowName}_flow.sql`;
        const migrationFilePath = path.join(migrationsDir, migrationFileName);

        // Write the SQL to a migration file
        fs.writeFileSync(migrationFilePath, compiledSql);
        // Show the migration file path relative to the current directory
        const relativeFilePath = path.relative(
          process.cwd(),
          migrationFilePath
        );
        log.success(`Migration file created: ${relativeFilePath}`);
        
      } catch (error) {
        log.error(
          `Compilation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        
        note('For troubleshooting help, visit: https://pgflow.dev/getting-started/compile-to-sql/');
        
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
    log.info('Running Deno compiler');

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
      // Always display the task log with command and output
      note(createTaskLog('deno', args, stdout));
      
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