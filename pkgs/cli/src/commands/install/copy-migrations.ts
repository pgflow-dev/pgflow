import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, confirm, note } from '@clack/prompts';
import chalk from 'chalk';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the pgflow migrations
const sourcePath = path.resolve(__dirname, '../../migrations');

export async function copyMigrations({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<true> {
  const migrationsPath = path.join(supabasePath, 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source migrations directory not found at ${sourcePath}.
This might happen if you're running from source instead of the built package.
Try building the package first with: nx build cli`);
  }

  const files = fs.readdirSync(sourcePath);
  const filesToCopy: string[] = [];
  const skippedFiles: string[] = [];

  // Determine which files need to be copied
  for (const file of files) {
    const destination = path.join(migrationsPath, file);

    if (fs.existsSync(destination)) {
      skippedFiles.push(file);
    } else {
      filesToCopy.push(file);
    }
  }

  // If no files to copy, throw an error
  if (filesToCopy.length === 0) {
    throw new Error(
      'No new migrations to copy - all migrations are already in place'
    );
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

  const shouldContinue =
    autoConfirm ||
    (await confirm({
      message: `Do you want to proceed with copying ${
        filesToCopy.length
      } migration file${filesToCopy.length !== 1 ? 's' : ''}?`,
    }));

  if (!shouldContinue) {
    throw new Error('Copying migrations cancelled');
  }

  log.info(`Copying migrations`);

  // Copy the files
  for (const file of filesToCopy) {
    const source = path.join(sourcePath, file);
    const destination = path.join(migrationsPath, file);

    fs.copyFileSync(source, destination);
    log.step(`Copied ${file}`);
  }

  log.success(
    `Successfully copied ${filesToCopy.length} migration file${
      filesToCopy.length !== 1 ? 's' : ''
    }`
  );

  return true; // Return true to indicate migrations were copied
}
