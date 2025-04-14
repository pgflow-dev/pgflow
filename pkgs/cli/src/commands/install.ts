import fs from 'fs';
import { type Command } from 'commander';
import { intro, isCancel, text, log } from '@clack/prompts';

export default (program: Command) => {
  program
    .command('install')
    .description('Installs pgflow migration and worker edge function')
    // .option(
    //   '--supabase-path <supabase-path>',
    //   'Path to supabase project',
    //   false
    // )
    .action(async () => {
      intro('pgflow - installing the migrations');

      const result = await text({
        message: 'Enter the path to your supabase/ directory',
        placeholder: './supabase/',
        validate(value) {
          if (!fs.existsSync(value)) {
            return `${value} is not a valid path`;
          }
          return undefined;
        },
      });

      if (isCancel(result)) {
        log.error('Aborting installation');
        return;
      }

      log.success(`Installing pgflow into ${result}`);
    });
};
