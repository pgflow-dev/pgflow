import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { log, confirm, note, spinner } from '@clack/prompts';
import chalk from 'chalk';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a require function to use require.resolve
const require = createRequire(import.meta.url);

// Function to find migrations directory
function findMigrationsDirectory() {
  try {
    // First try: resolve from installed @pgflow/core package
    const corePackageJsonPath = require.resolve('@pgflow/core/package.json');
    const corePackageFolder = path.dirname(corePackageJsonPath);
    const packageMigrationsPath = path.join(
      corePackageFolder,
      'dist',
      'supabase',
      'migrations'
    );

    if (fs.existsSync(packageMigrationsPath)) {
      return packageMigrationsPath;
    }

    // If that fails, try development path
    log.info(
      'Could not find migrations in installed package, trying development paths...'
    );
  } catch (error) {
    log.info(
      'Could not resolve @pgflow/core package, trying development paths...'
    );
  }

  // Try development paths
  // 1. Try relative to CLI dist folder (when running built CLI)
  const distRelativePath = path.resolve(
    __dirname,
    '../../../../core/supabase/migrations'
  );
  if (fs.existsSync(distRelativePath)) {
    return distRelativePath;
  }

  // 2. Try relative to CLI source folder (when running from source)
  const sourceRelativePath = path.resolve(
    __dirname,
    '../../../../../core/supabase/migrations'
  );
  if (fs.existsSync(sourceRelativePath)) {
    return sourceRelativePath;
  }

  // 3. Try local migrations directory (for backward compatibility)
  const localMigrationsPath = path.resolve(__dirname, '../../migrations');
  if (fs.existsSync(localMigrationsPath)) {
    return localMigrationsPath;
  }

  // No migrations found
  return null;
}

// Find the migrations directory
const sourcePath = findMigrationsDirectory();

export async function copyMigrations({
  supabasePath,
  autoConfirm = false
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  // Start a spinner for checking migrations
  const migrationSpinner = spinner();
  migrationSpinner.start('Checking migrations...');
  
  const migrationsPath = path.join(supabasePath, 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    migrationSpinner.stop('Error finding migrations');
    log.error(`Could not find migrations directory`);
    log.info(
      'This might happen if @pgflow/core is not properly installed or built.'
    );
    log.info(
      'Make sure @pgflow/core is installed and contains the migrations.'
    );
    log.info(
      'If running in development mode, try building the core package first with: nx build core'
    );
    return false;
  }

  const files = fs.readdirSync(sourcePath);
  const filesToCopy: string[] = [];
  const skippedFiles: string[] = [];

  // Determine which SQL files need to be copied
  for (const file of files) {
    // Only process SQL files
    if (!file.endsWith('.sql')) {
      continue;
    }

    const destination = path.join(migrationsPath, file);

    if (fs.existsSync(destination)) {
      skippedFiles.push(file);
    } else {
      filesToCopy.push(file);
    }
  }

  // If no files to copy, show message and return false (no changes made)
  if (filesToCopy.length === 0) {
    migrationSpinner.stop('All migrations are up to date');
    log.info('All pgflow migrations are already in place');
    return false;
  }

  // Update spinner with found migrations
  migrationSpinner.stop(`Found ${filesToCopy.length} migration${filesToCopy.length !== 1 ? 's' : ''} to install`);

  // Prepare summary message with colored output
  const summaryParts = [];

  if (filesToCopy.length > 0) {
    summaryParts.push(`${chalk.green('New migrations to install:')}
${filesToCopy.map((file) => `${chalk.green('+')} ${file}`).join('\n')}`);
  }

  if (skippedFiles.length > 0) {
    summaryParts.push(`${chalk.yellow('Already installed:')}
${skippedFiles.map((file) => `${chalk.yellow('•')} ${file}`).join('\n')}`);
  }

  // Show summary and ask for confirmation if not auto-confirming
  note(summaryParts.join('\n\n'), 'pgflow Migrations');

  let shouldContinue = autoConfirm;
  
  if (!autoConfirm) {
    const confirmResult = await confirm({
      message: `Install ${filesToCopy.length} new migration${
        filesToCopy.length !== 1 ? 's' : ''
      }?`,
    });
    
    shouldContinue = confirmResult === true;
  }

  if (!shouldContinue) {
    log.info('Migration installation skipped');
    return false;
  }

  // Start a new spinner for the installation process
  const installSpinner = spinner();
  installSpinner.start('Installing migrations...');

  // Copy the files
  for (const file of filesToCopy) {
    const source = path.join(sourcePath, file);
    const destination = path.join(migrationsPath, file);

    fs.copyFileSync(source, destination);
  }

  installSpinner.stop('Migrations installed');
  log.success(
    `Installed ${filesToCopy.length} migration${
      filesToCopy.length !== 1 ? 's' : ''
    } to your Supabase project`
  );

  return true; // Return true to indicate migrations were copied
}