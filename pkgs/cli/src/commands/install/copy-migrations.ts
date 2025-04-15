import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, confirm, note } from '@clack/prompts';
import chalk from 'chalk';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the pgflow migrations
const sourcePath = path.resolve(__dirname, '../../../migrations');

export async function copyMigrations({
  supabasePath,
}: {
  supabasePath: string;
}) {
  log.info(`Preparing to copy migrations`);

  const migrationsPath = `${supabasePath}/migrations`;

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!fs.existsSync(sourcePath)) {
    log.error(`Source migrations directory not found at ${sourcePath}`);
    log.info(
      "This might happen if you're running from source instead of the built package."
    );
    log.info('Try building the package first with: nx build cli');
    return;
  }

  const files = fs.readdirSync(sourcePath);
  const filesToCopy: string[] = [];
  const skippedFiles: string[] = [];

  // Determine which files need to be copied
  for (const file of files) {
    const destination = `${migrationsPath}/${file}`;

    if (fs.existsSync(destination)) {
      skippedFiles.push(file);
    } else {
      filesToCopy.push(file);
    }
  }

  // If no files to copy, show message and return
  if (filesToCopy.length === 0) {
    log.success(
      'No new migrations to copy - all migrations are already in place'
    );
    return;
  }

  // Prepare summary message with colored output
  const summaryParts = [];

  if (filesToCopy.length > 0) {
    summaryParts.push(`${chalk.green('Files to be copied:')}
${filesToCopy.map((file) => `${chalk.green('+')} ${file}`).join('\n')}`);
  }

  if (skippedFiles.length > 0) {
    summaryParts.push(`${chalk.yellow('Files to be skipped (already exist):')}
${skippedFiles.map((file) => `${chalk.yellow('=')} ${file}`).join('\n')}`);
  }

  // Show summary and ask for confirmation
  note(summaryParts.join('\n\n'), 'Migration Summary');

  const shouldContinue = await confirm({
    message: `Do you want to proceed with copying ${
      filesToCopy.length
    } migration file${filesToCopy.length !== 1 ? 's' : ''}?`,
  });

  if (!shouldContinue) {
    log.info('Migration copy cancelled');
    return;
  }

  log.info(`Copying migrations`);

  // Copy the files
  for (const file of filesToCopy) {
    const source = `${sourcePath}/${file}`;
    const destination = `${migrationsPath}/${file}`;

    fs.copyFileSync(source, destination);
    log.step(`Copied ${file}`);
  }

  log.success(
    `Successfully copied ${filesToCopy.length} migration file${
      filesToCopy.length !== 1 ? 's' : ''
    }`
  );
}
