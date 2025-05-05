import { type Command } from 'commander';
import { intro, log, note, group, cancel } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { updateEnvFile } from './update-env-file.js';
import { supabasePathPrompt } from './supabase-path-prompt.js';

export default (program: Command) => {
  program
    .command('install')
    .description('Set up pgflow in your Supabase project')
    .option('--supabase-path <path>', 'Path to the Supabase folder')
    .option('-y, --yes', 'Automatically confirm all prompts', false)
    .action(async (options) => {
      intro('Installing pgflow in your Supabase project');

      // Use the group feature to organize installation steps
      const results = await group(
        {
          // Step 1: Determine Supabase path
          supabasePath: supabasePathPrompt,

          // Step 2: Update config.toml
          configUpdate: async ({ results: { supabasePath } }) => {
            if (!supabasePath) return false;

            return await updateConfigToml({
              supabasePath,
              autoConfirm: options.yes,
            });
          },

          // Step 3: Copy migrations
          migrations: async ({ results: { supabasePath } }) => {
            if (!supabasePath) return false;

            return await copyMigrations({
              supabasePath,
              autoConfirm: options.yes,
            });
          },

          // Step 4: Update environment variables
          envFile: async ({ results: { supabasePath } }) => {
            if (!supabasePath) return false;

            return await updateEnvFile({
              supabasePath,
              autoConfirm: options.yes,
            });
          },
        },
        {
          // Handle cancellation
          onCancel: () => {
            cancel('Installation cancelled');
            process.exit(1);
          },
        }
      );

      // Extract the results from the group operation
      const supabasePath = results.supabasePath;
      const configUpdate = results.configUpdate;
      const migrations = results.migrations;
      const envFile = results.envFile;

      // Exit if supabasePath is null (validation failed or user cancelled)
      if (!supabasePath) {
        cancel('Installation cancelled - valid Supabase path is required');
        process.exit(1);
      }

      // Show completion message
      if (migrations || configUpdate || envFile) {
        log.success('pgflow setup completed successfully');

        // Show next steps if changes were made
        const nextSteps = [];

        if (configUpdate || envFile) {
          nextSteps.push(
            '• Restart your Supabase instance for configuration changes to take effect'
          );
        }

        if (migrations) {
          nextSteps.push('• Apply the migrations with: supabase migrations up');
        }

        // Add documentation link
        nextSteps.push(
          '• For more information, visit: https://pgflow.dev/getting-started/install-pgflow/'
        );

        if (nextSteps.length > 0) {
          note(nextSteps.join('\n'), 'Next steps');
        }
      } else {
        log.success(
          'pgflow is already properly configured - no changes needed'
        );

        // Still show documentation link even if no changes were made
        note(
          'For more information about pgflow, visit: https://pgflow.dev/getting-started/install-pgflow/',
          'Documentation'
        );
      }
    });
};
