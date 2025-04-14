import fs from 'fs';
import { type Command } from 'commander';
import { intro, isCancel, text, log } from '@clack/prompts';
import { copyMigrations } from './copy-migrations.js';

function validate(path: string) {
  const pathsToTest = [
    [path, 'is not a valid path'],
    [`${path}/config.toml`, 'does not contain config.toml'],
    [`${path}/migrations`, 'does not contain migrations folder!'],
  ];

  // if any of the pathsToTest fail, return the error message
  for (const [testPath, errorMessage] of pathsToTest) {
    if (!fs.existsSync(testPath)) {
      return `${path} ${errorMessage}`;
    }
  }

  // otherwise, return undefined
  return undefined;
}

export default (program: Command) => {
  program
    .command('install')
    .description('Installs pgflow migration and worker edge function')
    .action(async () => {
      intro('pgflow - Postgres-native workflows for Supabase');

      const result = await text({
        message: 'Enter the path to your supabase/ directory',
        placeholder: 'supabase/',
        initialValue: 'supabase/',
        validate,
      });

      if (isCancel(result)) {
        log.error('Aborting installation');
        return;
      }

      log.info(`Copying migrations`);
      copyMigrations({ supabasePath: result });
      log.info(`Updating config.toml`);
      log.info(`Restarting Supabase`);
    });
};
