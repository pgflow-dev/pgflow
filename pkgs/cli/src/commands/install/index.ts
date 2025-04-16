import { type Command } from 'commander';
import { intro, isCancel, log } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { supabasePathPrompt } from './supabase-path-prompt.js';

export default (program: Command) => {
  program
    .command('install')
    .description('Copies migrations and sets config.toml values')
    .action(async () => {
      intro('pgflow - Postgres-native workflows for Supabase');

      const supabasePath = await supabasePathPrompt();

      if (isCancel(supabasePath)) {
        log.error('Aborting installation');
        return;
      }

      // Try to copy migrations first - this is a required step
      try {
        await copyMigrations({ supabasePath });
      } catch (error) {
        log.error(
          `Error copying migrations: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        return;
      }

      // Only proceed with config update if migrations were successful
      try {
        await updateConfigToml({ supabasePath });
      } catch (error) {
        log.error(
          `Error updating config.toml: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        return;
      }

      // If we got here, installation was successful
      log.success('pgflow installation is completed');

      // Show specific reminders
      log.warn(
        'Remember to restart Supabase for the configuration changes to take effect!'
      );
      log.warn('Remember to apply the migrations!');
    });
};
