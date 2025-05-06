import { type Command } from 'commander';
import { intro, log, note, group, cancel, outro } from '@clack/prompts';
import chalk from 'chalk';
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
          supabasePath: () =>
            supabasePathPrompt({ supabasePath: options.supabasePath }),

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
      const outroMessages = [];
      
      // Always start with a bolded acknowledgement
      if (migrations || configUpdate || envFile) {
        outroMessages.push(chalk.bold('pgflow setup completed successfully!'));
      } else {
        outroMessages.push(chalk.bold('pgflow is already properly configured - no changes needed!'));
      }
      
      // Add a newline after the acknowledgement
      outroMessages.push('');
      
      // Add specific next steps if changes were made
      if (configUpdate || envFile) {
        outroMessages.push(`- Restart your Supabase instance for configuration changes to take effect`);
      }

      if (migrations) {
        outroMessages.push(`- Apply the migrations with: ${chalk.cyan('supabase migrations up')}`);
      }
      
      // Always add documentation link with consistent formatting
      if (outroMessages.length > 2) {  // If we have specific steps, add another newline
        outroMessages.push('');
      }
      
      outroMessages.push(
        chalk.bold('Continue the setup:'),
        chalk.blue.underline('https://pgflow.dev/getting-started/compile-to-sql/')
      );

      // Single outro for all paths
      outro(outroMessages.join('\n'));
    });
};
