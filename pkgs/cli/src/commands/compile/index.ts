import { type Command } from 'commander';
import { intro, log, spinner } from '@clack/prompts';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (program: Command) => {
  program
    .command('compile')
    .description('Compiles a TypeScript-defined flow into SQL migration')
    .argument('<flowPath>', 'Path to the flow TypeScript file')
    .requiredOption(
      '--deno-json <denoJsonPath>',
      'Path to deno.json with valid importMap'
    )
    .action(async (flowPath, options) => {
      intro('pgflow - Compile Flow to SQL');

      try {
        // Resolve paths
        const resolvedFlowPath = path.resolve(process.cwd(), flowPath);
        const resolvedDenoJsonPath = path.resolve(
          process.cwd(),
          options.denoJson
        );

        // Validate paths
        if (!fs.existsSync(resolvedFlowPath)) {
          log.error(`Flow file not found: ${resolvedFlowPath}`);
          process.exit(1);
        }

        if (!fs.existsSync(resolvedDenoJsonPath)) {
          log.error(`deno.json file not found: ${resolvedDenoJsonPath}`);
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
  denoJsonPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const deno = spawn('deno', [
      'run',
      '--allow-read',
      `--import-map=${denoJsonPath}`,
      scriptPath,
      flowPath,
    ]);

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
