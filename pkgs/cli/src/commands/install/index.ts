import { type Command } from 'commander';
import { intro, log, note } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';
import { updateConfigToml } from './update-config-toml.js';
import { updateEnvFile } from './update-env-file.js';
import path from 'path';
import fs from 'fs';

export default (program: Command) => {
  program
    .command('install')
    .description('Set up pgflow in your Supabase project')
    .option('--supabase-path <path>', 'Path to the Supabase folder')
    .option('-y, --yes', 'Automatically confirm all prompts', false)
    .action(async (options) => {
      intro('pgflow - Postgres-native workflows for Supabase');

      // Handle Supabase path - either from option or try to detect it
      let supabasePath: string;

      if (options.supabasePath) {
        supabasePath = path.resolve(process.cwd(), options.supabasePath);
      } else {
        // Try to detect the Supabase directory automatically
        const possiblePaths = ['./supabase', '../supabase', '../../supabase'];
        
        let detectedPath = '';
        for (const testPath of possiblePaths) {
          if (
            fs.existsSync(testPath) &&
            fs.existsSync(path.join(testPath, 'config.toml'))
          ) {
            detectedPath = testPath;
            break;
          }
        }

        if (detectedPath) {
          log.success(`Found Supabase project at: ${detectedPath}`);
          supabasePath = path.resolve(process.cwd(), detectedPath);
        } else {
          log.error('Could not automatically detect Supabase directory');
          log.info('Please provide the path using --supabase-path option');
          process.exit(1);
        }
      }

      // Validate Supabase path
      if (!fs.existsSync(supabasePath)) {
        log.error(`Directory not found: ${supabasePath}`);
        process.exit(1);
      }

      if (!fs.existsSync(path.join(supabasePath, 'config.toml'))) {
        log.error(`Not a valid Supabase project (missing config.toml) at ${supabasePath}`);
        process.exit(1);
      }

      // First update config.toml, then copy migrations
      const configUpdated = await updateConfigToml({ 
        supabasePath,
        autoConfirm: options.yes
      });
      
      const migrationsCopied = await copyMigrations({ 
        supabasePath,
        autoConfirm: options.yes
      });
      
      const envFileCreated = await updateEnvFile({ 
        supabasePath,
        autoConfirm: options.yes
      });

      // Show completion message
      if (migrationsCopied || configUpdated || envFileCreated) {
        log.success('pgflow setup completed successfully');

        // Show next steps if changes were made
        const nextSteps = [];

        if (configUpdated || envFileCreated) {
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