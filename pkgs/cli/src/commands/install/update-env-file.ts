import fs from 'fs';
import path from 'path';
import { log, confirm } from '@clack/prompts';
import chalk from 'chalk';

/**
 * Updates the functions/.env file with required environment variables for pgflow
 *
 * @param options.supabasePath - Path to the supabase directory
 * @param options.autoConfirm - Whether to automatically confirm changes
 * @returns Promise<boolean> - True if changes were made, false otherwise
 */
export async function updateEnvFile({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  // Check environment variables
  
  const functionsDir = path.join(supabasePath, 'functions');
  const envFilePath = path.join(functionsDir, '.env');

  // Create functions directory if it doesn't exist
  if (!fs.existsSync(functionsDir)) {
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
    isNewFile = true;
  }

  // Prepare new content
  let newContent = currentContent;

  // Check which variables need to be added
  const missingVars: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(envVars)) {
    if (!newContent.includes(`${key}=`)) {
      missingVars.push({ key, value });
    }
  }

  // If no changes needed, return early
  if (missingVars.length === 0) {
    log.success('Environment variables are already set');
    return false;
  }

  // Build summary message with explanation
  const summaryParts = [
    isNewFile
      ? `Create ${chalk.cyan('functions/.env')} ${chalk.dim('(worker configuration)')}:`
      : `Update ${chalk.cyan('functions/.env')} ${chalk.dim('(worker configuration)')}:`,
    '',
    ...missingVars.map(({ key, value }) => `    ${chalk.bold(key)}="${value}"`),
  ];

  log.info(summaryParts.join('\n'));

  // Ask for confirmation if not auto-confirming
  let shouldContinue = autoConfirm;

  if (!autoConfirm) {
    const confirmResult = await confirm({
      message: isNewFile ? `Create functions/.env?` : `Update functions/.env?`,
    });

    shouldContinue = confirmResult === true;
  }

  if (!shouldContinue) {
    log.warn('Environment variable update skipped');
    return false;
  }

  // Update environment variables

  // Apply changes if confirmed
  for (const { key, value } of missingVars) {
    // Add a newline at the end if the file doesn't end with one and isn't empty
    if (newContent && !newContent.endsWith('\n')) {
      newContent += '\n';
    }

    // Add the new variable
    newContent += `${key}="${value}"\n`;
  }

  // Write the file if changes were made
  try {
    fs.writeFileSync(envFilePath, newContent);
    log.success('Environment variables configured');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to update environment variables: ${errorMessage}`);
    return false;
  }
}
