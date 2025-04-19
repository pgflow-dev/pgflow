import { type Command } from 'commander';
import { intro, isCancel, log, note } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { supabasePathPrompt } from './supabase-path-prompt.js';

export default (program: Command) => {
  program
    .command('install')
    .description('Set up pgflow in your Supabase project')
    .action(async () => {
      intro('pgflow - Postgres-native workflows for Supabase');

      const supabasePath = await supabasePathPrompt();

      if (isCancel(supabasePath)) {
        log.error('Installation cancelled');
        return;
      }

      // First update config.toml, then copy migrations
      const configUpdated = await updateConfigToml({ supabasePath });
      const migrationsCopied = await copyMigrations({ supabasePath });

      // Show completion message
      if (migrationsCopied || configUpdated) {
        log.success('pgflow setup completed successfully');

        // Show next steps if changes were made
        const nextSteps = [];

        if (configUpdated) {
          nextSteps.push(
            '• Restart your Supabase instance for configuration changes to take effect'
          );
        }

        if (migrationsCopied) {
          nextSteps.push('• Apply the migrations with: supabase db push');
        }

        if (nextSteps.length > 0) {
          note(nextSteps.join('\n'), 'Next steps');
        }
      } else {
        log.success(
          'pgflow is already properly configured - no changes needed'
        );
      }
    });
};
