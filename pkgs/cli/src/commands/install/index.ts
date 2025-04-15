import { type Command } from 'commander';
import { intro, isCancel, log } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { supabasePathPrompt } from './supabase-path-prompt.js';

export default (program: Command) => {
  program
    .command('install')
    .description('Installs pgflow migration and worker edge function')
    .action(async () => {
      intro('pgflow - Postgres-native workflows for Supabase');

      const supabasePath = await supabasePathPrompt();

      if (isCancel(supabasePath)) {
        log.error('Aborting installation');
        return;
      }

      const migrationsCopied = await copyMigrations({ supabasePath });
      const configUpdated = await updateConfigToml({ supabasePath });

      if (migrationsCopied || configUpdated) {
        log.success('pgflow installation is completed');
      }

      if (!migrationsCopied && !configUpdated) {
        log.success(
          'No changes were made - pgflow is already properly configured.'
        );
      }

      // Show specific reminders based on what was actually done
      if (configUpdated) {
        log.warn(
          'Remember to restart Supabase for the configuration changes to take effect!'
        );
      }

      if (migrationsCopied) {
        log.warn('Remember to apply the migrations!');
      }
    });
};
