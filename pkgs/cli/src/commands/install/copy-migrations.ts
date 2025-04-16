import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { log, confirm, note } from '@clack/prompts';
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
}: {
  supabasePath: string;
}): Promise<boolean> {
  const migrationsPath = path.join(supabasePath, 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!sourcePath || !fs.existsSync(sourcePath)) {
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

  // Determine which files need to be copied
  for (const file of files) {
    const destination = path.join(migrationsPath, file);

    if (fs.existsSync(destination)) {
      skippedFiles.push(file);
    } else {
      filesToCopy.push(file);
    }
  }

  // If no files to copy, show message and return false (no changes made)
  if (filesToCopy.length === 0) {
    log.info('No new migrations to copy - all migrations are already in place');
    return false;
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
    return false;
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
