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

      await copyMigrations({ supabasePath });
      await updateConfigToml({ supabasePath });
      log.success('pgflow installation is completed');
      log.warn('Remember to restart Supabase and apply the migrations!');
    });
};
