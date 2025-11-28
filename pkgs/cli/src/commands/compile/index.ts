import { type Command } from 'commander';
import chalk from 'chalk';
import { intro, log, outro } from '@clack/prompts';
import path from 'path';
import fs from 'fs';

// Default Supabase local development publishable key (same for all local projects)
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

/**
 * Fetch flow SQL from ControlPlane HTTP endpoint
 */
export async function fetchFlowSQL(
  flowSlug: string,
  controlPlaneUrl: string,
  publishableKey: string
): Promise<{ flowSlug: string; sql: string[] }> {
  const url = `${controlPlaneUrl}/flows/${flowSlug}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${publishableKey}`,
        'apikey': publishableKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      let errorData: { error?: string; message?: string } = {};
      try {
        errorData = await response.json();
      } catch {
        // JSON parse failed - likely Supabase gateway error (HTML or plain text)
      }

      // Check if this is our ControlPlane's 404 (has 'Flow Not Found' error)
      // vs Supabase gateway's 404 (function doesn't exist)
      if (errorData.error === 'Flow Not Found') {
        throw new Error(
          `Flow '${flowSlug}' not found.\n\n` +
            `${errorData.message || 'Did you add it to supabase/functions/pgflow/index.ts?'}\n\n` +
            `Fix:\n` +
            `1. Add your flow to supabase/functions/pgflow/index.ts\n` +
            `2. Restart edge functions: supabase functions serve`
        );
      }

      // ControlPlane edge function itself doesn't exist
      throw new Error(
        'ControlPlane edge function not found.\n\n' +
          'The pgflow edge function is not installed or not running.\n\n' +
          'Fix:\n' +
          '1. Run: npx pgflow install\n' +
          '2. Start edge functions: supabase functions serve\n\n' +
          'Or use previous version: npx pgflow@0.8.0 compile path/to/flow.ts'
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      // Check for connection refused errors
      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('fetch failed')
      ) {
        throw new Error(
          'Could not connect to ControlPlane.\n\n' +
            'Fix options:\n' +
            '1. Start Supabase: supabase start\n' +
            '2. Start edge functions: supabase functions serve\n\n' +
            'Or use previous version: npx pgflow@0.8.0 compile path/to/flow.ts'
        );
      }

      throw error;
    }

    throw new Error(`Unknown error: ${String(error)}`);
  }
}

export default (program: Command) => {
  program
    .command('compile')
    .description('Compiles a flow into SQL migration via ControlPlane HTTP')
    .argument('<flowSlug>', 'Flow slug to compile (e.g., my_flow)')
    .option(
      '--deno-json <denoJsonPath>',
      '[DEPRECATED] No longer used. Will be removed in v1.0'
    )
    .option('--supabase-path <supabasePath>', 'Path to the Supabase folder')
    .option(
      '--control-plane-url <url>',
      'Control plane URL',
      'http://127.0.0.1:54321/functions/v1/pgflow'
    )
    .option(
      '--publishable-key <key>',
      'Supabase publishable key (legacy anon keys also work)',
      DEFAULT_PUBLISHABLE_KEY
    )
    .action(async (flowSlug, options) => {
      intro('pgflow - Compile Flow to SQL');

      try {
        // Show deprecation warning for --deno-json
        if (options.denoJson) {
          log.warn(
            'The --deno-json flag is deprecated and no longer used.\n' +
              'Flow compilation now happens via HTTP, not local Deno.\n' +
              'This flag will be removed in v1.0'
          );
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

        // Create migrations directory if it doesn't exist
        const migrationsDir = path.resolve(supabasePath, 'migrations');
        if (!fs.existsSync(migrationsDir)) {
          fs.mkdirSync(migrationsDir, { recursive: true });
          log.success(`Created migrations directory: ${migrationsDir}`);
        }

        // Check for existing migrations
        const existingMigrations = fs
          .readdirSync(migrationsDir)
          .filter((file) => file.endsWith(`_create_${flowSlug}_flow.sql`));

        if (existingMigrations.length > 0) {
          log.warn(
            `Found existing migration(s) for '${flowSlug}':\n` +
              existingMigrations.map((f) => `  ${f}`).join('\n') +
              '\nCreating new migration anyway...'
          );
        }

        // Fetch flow SQL from ControlPlane
        log.info(`Compiling flow: ${flowSlug}`);
        const result = await fetchFlowSQL(
          flowSlug,
          options.controlPlaneUrl,
          options.publishableKey
        );

        // Validate result
        if (!result.sql || result.sql.length === 0) {
          throw new Error('ControlPlane returned empty SQL');
        }

        // Join SQL statements
        const compiledSql = result.sql.join('\n') + '\n';

        // Generate timestamp for migration file in format YYYYMMDDHHMMSS using UTC
        const now = new Date();
        const timestamp = [
          now.getUTCFullYear(),
          String(now.getUTCMonth() + 1).padStart(2, '0'),
          String(now.getUTCDate()).padStart(2, '0'),
          String(now.getUTCHours()).padStart(2, '0'),
          String(now.getUTCMinutes()).padStart(2, '0'),
          String(now.getUTCSeconds()).padStart(2, '0'),
        ].join('');

        // Create migration filename in the format: <timestamp>_create_<flow_slug>_flow.sql
        const migrationFileName = `${timestamp}_create_${flowSlug}_flow.sql`;
        const migrationFilePath = path.join(migrationsDir, migrationFileName);

        // Write the SQL to a migration file
        fs.writeFileSync(migrationFilePath, compiledSql);

        // Show the migration file path relative to the current directory
        const relativeFilePath = path.relative(
          process.cwd(),
          migrationFilePath
        );
        log.success(`Migration file created: ${relativeFilePath}`);

        // Display next steps with outro
        outro(
          [
            chalk.bold('Flow compilation completed successfully!'),
            '',
            `- Run ${chalk.cyan('supabase migration up')} to apply the migration`,
            '',
            chalk.bold('Continue the setup:'),
            chalk.blue.underline('https://pgflow.dev/getting-started/run-flow/'),
          ].join('\n')
        );
      } catch (error) {
        log.error(
          `Compilation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        outro(
          [
            chalk.bold('Compilation failed!'),
            '',
            chalk.bold('For troubleshooting help:'),
            chalk.blue.underline(
              'https://pgflow.dev/getting-started/compile-to-sql/'
            ),
          ].join('\n')
        );

        process.exit(1);
      }
    });
};
