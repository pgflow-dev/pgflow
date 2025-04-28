import fs from 'fs';
import path from 'path';
import { log, note, confirm } from '@clack/prompts';
import chalk from 'chalk';

/**
 * Updates the functions/.env file with required environment variables for pgflow
 *
 * @param options.supabasePath - Path to the supabase directory
 * @returns Promise<boolean> - True if changes were made, false otherwise
 */
export async function updateEnvFile({
  supabasePath,
}: {
  supabasePath: string;
}): Promise<boolean> {
  const functionsDir = path.join(supabasePath, 'functions');
  const envFilePath = path.join(functionsDir, '.env');

  // Create functions directory if it doesn't exist
  if (!fs.existsSync(functionsDir)) {
    log.step('Creating functions directory...');
    fs.mkdirSync(functionsDir, { recursive: true });
  }

  // Variables to add
  const envVars = {
    EDGE_WORKER_DB_URL:
      'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres',
    EDGE_WORKER_LOG_LEVEL: 'info',
  };

  // Check if file exists and read its content
  let currentContent = '';
  let isNewFile = false;

  if (fs.existsSync(envFilePath)) {
    currentContent = fs.readFileSync(envFilePath, 'utf8');
  } else {
    log.step('Creating new .env file...');
    isNewFile = true;
  }

  // Prepare new content
  let newContent = currentContent;

  // Build diff preview
  const missingVars: Array<{ key: string; value: string }> = [];
  const existingVars: Array<string> = [];

  // Check which variables need to be added
  for (const [key, value] of Object.entries(envVars)) {
    if (!newContent.includes(`${key}=`)) {
      missingVars.push({ key, value });
    } else {
      existingVars.push(key);
    }
  }

  // If no changes needed, return early
  if (missingVars.length === 0) {
    log.info('Environment variables are already set');
    return false;
  }

  // Build diff preview
  const diffPreview: Array<string> = [];

  if (isNewFile) {
    diffPreview.push(`${chalk.green('Creating new .env file with:')}`);
  } else {
    diffPreview.push(`${chalk.green('Adding to existing .env file:')}`);
  }

  // Show variables to be added
  for (const { key, value } of missingVars) {
    diffPreview.push(`${chalk.green('+')} ${key}="${value}"`);
  }

  // Show existing variables if any
  if (existingVars.length > 0) {
    diffPreview.push('');
    diffPreview.push(`${chalk.yellow('Already present:')}`);
    for (const key of existingVars) {
      diffPreview.push(`${chalk.yellow('•')} ${key}`);
    }
  }

  // Show the diff preview
  note(diffPreview.join('\n'), 'Environment Variables');

  // Ask for confirmation
  const shouldContinue = await confirm({
    message: `Update environment variables?`,
  });

  if (!shouldContinue) {
    log.info('Environment variable update skipped');
    return false;
  }

  // Apply changes if confirmed
  for (const { key, value } of missingVars) {
    // Add a newline at the end if the file doesn't end with one and isn't empty
    if (newContent && !newContent.endsWith('\n')) {
      newContent += '\n';
    }

    // Add the new variable
    newContent += `${key}="${value}"\n`;
    log.step(`Adding ${key} environment variable`);
  }

  // Write the file if changes were made
  fs.writeFileSync(envFilePath, newContent);
  log.success('Environment variables updated successfully');
  return true;
}
