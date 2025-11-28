import { type Command } from 'commander';
import { intro, log, confirm, cancel, outro } from '@clack/prompts';
import chalk from 'chalk';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { updateEnvFile } from './update-env-file.js';
import { createEdgeFunction } from './create-edge-function.js';
import { supabasePathPrompt } from './supabase-path-prompt.js';

export default (program: Command) => {
  program
    .command('install')
    .description('Set up pgflow in your Supabase project')
    .option('--supabase-path <path>', 'Path to the Supabase folder')
    .option('-y, --yes', 'Automatically confirm all prompts', false)
    .action(async (options) => {
      intro('Installing pgflow in your Supabase project');

      // Step 1: Get supabase path
      const supabasePathResult = await supabasePathPrompt({
        supabasePath: options.supabasePath,
      });

      if (!supabasePathResult || typeof supabasePathResult === 'symbol') {
        cancel('Installation cancelled - valid Supabase path is required');
        process.exit(1);
      }

      const supabasePath = supabasePathResult;

      // Step 2: Show summary and get single confirmation
      const summaryMsg = [
        'This will:',
        '',
        `  • Update ${chalk.cyan('supabase/config.toml')} ${chalk.dim('(enable pooler, per_worker runtime)')}`,
        `  • Add pgflow migrations to ${chalk.cyan('supabase/migrations/')}`,
        `  • Create Control Plane in ${chalk.cyan('supabase/functions/pgflow/')}`,
        `  • Configure ${chalk.cyan('supabase/functions/.env')}`,
        '',
        `  ${chalk.green('✓ Safe to re-run - completed steps will be skipped')}`,
      ].join('\n');

      log.info(summaryMsg);

      let shouldProceed = options.yes;

      if (!options.yes) {
        const confirmResult = await confirm({
          message: 'Proceed?',
        });

        if (confirmResult !== true) {
          cancel('Installation cancelled');
          process.exit(1);
        }

        shouldProceed = true;
      }

      if (!shouldProceed) {
        cancel('Installation cancelled');
        process.exit(1);
      }

      // Step 3: Run all installation steps with autoConfirm
      const configUpdate = await updateConfigToml({
        supabasePath,
        autoConfirm: true,
      });

      const migrations = await copyMigrations({
        supabasePath,
        autoConfirm: true,
      });

      const edgeFunction = await createEdgeFunction({
        supabasePath,
        autoConfirm: true,
      });

      const envFile = await updateEnvFile({
        supabasePath,
        autoConfirm: true,
      });

      // Step 4: Show completion message
      const outroMessages: string[] = [];

      if (migrations || configUpdate || edgeFunction || envFile) {
        outroMessages.push(chalk.green.bold('✓ Installation complete!'));
      } else {
        outroMessages.push(
          chalk.green.bold('✓ pgflow is already installed - no changes needed!')
        );
      }

      // Add numbered next steps
      outroMessages.push('');
      outroMessages.push('Next steps:');

      let stepNumber = 1;

      if (configUpdate || envFile) {
        outroMessages.push(
          `  ${stepNumber}. Restart Supabase: ${chalk.cyan('supabase stop && supabase start')}`
        );
        stepNumber++;
      }

      if (migrations) {
        outroMessages.push(
          `  ${stepNumber}. Apply migrations: ${chalk.cyan('supabase migrations up')}`
        );
        stepNumber++;
      }

      outroMessages.push(
        `  ${stepNumber}. Create your first flow: ${chalk.blue.underline('https://pgflow.dev/getting-started/create-first-flow/')}`
      );

      outro(outroMessages.join('\n'));
    });
};
