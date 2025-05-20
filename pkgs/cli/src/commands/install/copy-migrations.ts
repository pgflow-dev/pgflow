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

// Helper function to get the timestamp part from a migration filename
function getTimestampFromFilename(filename: string): string {
  const match = filename.match(/^(\d+)_/);
  // Return the timestamp only if it exists and has the correct length (14 digits)
  if (match && match[1] && match[1].length === 14 && /^\d{14}$/.test(match[1])) {
    return match[1];
  }
  return '';
}

// Helper function to format a Date object into a migration timestamp string (YYYYMMDDhhmmss) using UTC
function formatDateToTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// Helper function to parse a timestamp string into a Date object (interpreted as UTC)
function parseTimestampToDate(timestamp: string): Date | null {
  // Validate format: YYYYMMDDhhmmss
  if (!timestamp || timestamp.length !== 14 || !/^\d{14}$/.test(timestamp)) {
    return null;
  }

  const year = parseInt(timestamp.substring(0, 4), 10);
  const month = parseInt(timestamp.substring(4, 6), 10) - 1; // months are 0-indexed in JS Date
  const day = parseInt(timestamp.substring(6, 8), 10);
  const hours = parseInt(timestamp.substring(8, 10), 10);
  const minutes = parseInt(timestamp.substring(10, 12), 10);
  const seconds = parseInt(timestamp.substring(12, 14), 10);

  // Create date in UTC and validate (invalid dates like Feb 31 will be auto-corrected by JS Date)
  const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  
  // Additional validation to ensure the parsed date matches the input
  // This catches edge cases like month=13 that JS Date would autocorrect
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes ||
    date.getUTCSeconds() !== seconds
  ) {
    return null;
  }

  return date;
}

// Helper function to generate a new timestamp that's higher than the reference timestamp (using UTC)
function generateNewTimestamp(
  referenceTimestamp: string,
  increment = 1
): string {
  // First try to parse the reference timestamp to a Date
  const parsedDate = parseTimestampToDate(referenceTimestamp);
  
  // If we couldn't parse it, use current UTC time
  if (!parsedDate) {
    return formatDateToTimestamp(new Date());
  }
  
  // Add the specified number of seconds (default: 1)
  parsedDate.setUTCSeconds(parsedDate.getUTCSeconds() + increment);
  
  // Get current UTC time for comparison
  const now = new Date();
  
  // Return either the incremented timestamp or current time, whichever is later
  // This ensures we never go backwards in time
  if (parsedDate > now) {
    return formatDateToTimestamp(parsedDate);
  } else {
    // If we're already at or past current time, add increment to now
    now.setUTCSeconds(now.getUTCSeconds() + increment);
    return formatDateToTimestamp(now);
  }
}

// Find the migrations directory
const sourcePath = findMigrationsDirectory();

export async function copyMigrations({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  const migrationsPath = path.join(supabasePath, 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    log.error(`Could not find migrations directory`);
    log.warn(
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

  // Get all existing migrations in user's directory
  const existingFiles = fs.existsSync(migrationsPath)
    ? fs.readdirSync(migrationsPath)
    : [];

  // Find the latest migration timestamp in user's directory
  let latestTimestamp = '00000000000000';
  for (const file of existingFiles) {
    if (file.endsWith('.sql')) {
      const timestamp = getTimestampFromFilename(file);
      // Only consider timestamps that have been validated by getTimestampFromFilename
      // to have the correct length and format
      if (timestamp && timestamp.length === 14) {
        const parsedDate = parseTimestampToDate(timestamp);
        // If we have a valid date and this timestamp is newer, update latestTimestamp
        if (parsedDate && parseInt(timestamp, 10) > parseInt(latestTimestamp, 10)) {
          latestTimestamp = timestamp;
        }
      }
    }
  }

  // Get all source migrations
  const sourceFiles = fs
    .readdirSync(sourcePath)
    .filter((file) => file.endsWith('.sql'));

  const filesToCopy: Array<{ source: string; destination: string }> = [];
  const skippedFiles: string[] = [];

  // Check which migrations need to be installed
  for (const sourceFile of sourceFiles) {
    // Check if this migration is already installed (by checking if the original filename
    // appears in any existing migration filename)
    const isAlreadyInstalled = existingFiles.some((existingFile) =>
      existingFile.includes(sourceFile)
    );

    if (isAlreadyInstalled) {
      skippedFiles.push(sourceFile);
    } else {
      filesToCopy.push({
        source: sourceFile,
        destination: sourceFile, // Will be updated later with new timestamp
      });
    }
  }

  // If no files to copy, show message with details and return false (no changes made)
  if (filesToCopy.length === 0) {
    // Show success message
    log.success('All pgflow migrations are already in place');

    // Show details of already installed migrations
    if (skippedFiles.length > 0) {
      const detailedMsg = [
        'Already installed migrations:',
        ...skippedFiles.map((file) => {
          // Find the matching existing file to show how it was installed
          const matchingFile = existingFiles.find((existingFile) =>
            existingFile.includes(file)
          );

          if (matchingFile === file) {
            // Installed with old direct method
            return `  ${chalk.dim('•')} ${chalk.bold(file)}`;
          } else {
            // Installed with new timestamped method
            const timestampPart =
              matchingFile?.substring(0, matchingFile.indexOf(file) - 1) || '';
            return `  ${chalk.dim('•')} ${chalk.dim(
              timestampPart + '_'
            )}${chalk.bold(file)}`;
          }
        }),
      ].join('\n');

      note(detailedMsg, 'Existing pgflow Migrations');
    }

    return false;
  }

  // Generate new timestamps for migrations to install
  let baseTimestamp = latestTimestamp;
  filesToCopy.forEach((file) => {
    // Generate timestamp with increasing values to maintain order
    // Each iteration uses the timestamp generated by the previous iteration as the base
    baseTimestamp = generateNewTimestamp(baseTimestamp);
    // Create new filename with format: newTimestamp_originalFilename
    file.destination = `${baseTimestamp}_${file.source}`;
  });

  log.info(
    `Found ${filesToCopy.length} migration${
      filesToCopy.length !== 1 ? 's' : ''
    } to install`
  );

  // Prepare summary message with colored output
  const summaryParts = [];

  if (filesToCopy.length > 0) {
    summaryParts.push(
      `${chalk.green('New migrations to install:')}\n${filesToCopy
        .map((file) => {
          // Extract the timestamp part from the new filename
          const newTimestamp = file.destination.substring(0, 14);
          // Format: dim timestamp + bright original name
          return `${chalk.green('+')} ${file.source} → ${chalk.dim(
            newTimestamp + '_'
          )}${chalk.bold(file.source)}`;
        })
        .join('\n')}`
    );
  }

  if (skippedFiles.length > 0) {
    summaryParts.push(
      `${chalk.yellow('Already installed:')}\n${skippedFiles
        .map((file) => `${chalk.yellow('•')} ${file}`)
        .join('\n')}`
    );
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
    log.warn('Migration installation skipped');
    return false;
  }

  // Install migrations with new filenames
  for (const file of filesToCopy) {
    const sourcePath1 = path.join(sourcePath, file.source);
    const destinationPath = path.join(migrationsPath, file.destination);

    fs.copyFileSync(sourcePath1, destinationPath);
  }

  // Show detailed success message with styled filenames
  const detailedSuccessMsg = [
    `Installed ${filesToCopy.length} migration${
      filesToCopy.length !== 1 ? 's' : ''
    } to your Supabase project:`,
    ...filesToCopy.map((file) => {
      const newTimestamp = file.destination.substring(0, 14);
      return `  ${chalk.dim(newTimestamp + '_')}${chalk.bold(file.source)}`;
    }),
  ].join('\n');

  log.success(detailedSuccessMsg);

  return true; // Return true to indicate migrations were copied
}
