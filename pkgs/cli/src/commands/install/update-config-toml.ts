import fs from 'fs';
import path from 'path';
import { log, confirm, note } from '@clack/prompts';
import * as TOML from 'toml-patch';
import chalk from 'chalk';

/**
 * Updates the config.toml file with necessary configurations for EdgeWorker
 * while preserving comments and formatting
 *
 * Makes the following changes:
 * 1. Enables the connection pooler
 * 2. Ensures pool_mode is set to "transaction"
 * 3. Changes edge_runtime policy from "oneshot" to "per_worker"
 * 4. Creates a backup of the original config.toml file before making changes
 *
 * @param options.supabasePath - Path to the supabase directory
 */
export async function updateConfigToml({
  supabasePath,
}: {
  supabasePath: string;
}): Promise<boolean> {
  const configPath = path.join(supabasePath, 'config.toml');
  const backupPath = `${configPath}.backup`;

  try {
    // Check if config.toml exists
    if (!fs.existsSync(configPath)) {
      throw new Error(`config.toml not found at ${configPath}`);
    }

    // Read the current config file
    const configContent = fs.readFileSync(configPath, 'utf8');

    // Parse the TOML content
    const config = TOML.parse(configContent) as {
      db?: {
        pooler?: {
          enabled?: boolean;
          pool_mode?: string;
        };
      };
      edge_runtime?: {
        policy?: string;
      };
    };

    // Get current settings
    const currentSettings = {
      poolerEnabled: config.db?.pooler?.enabled ?? false,
      poolMode: config.db?.pooler?.pool_mode ?? 'none',
      edgeRuntimePolicy: config.edge_runtime?.policy ?? 'oneshot',
    };

    // Check if any changes are needed
    const needsChanges =
      currentSettings.poolerEnabled !== true ||
      currentSettings.poolMode !== 'transaction' ||
      currentSettings.edgeRuntimePolicy !== 'per_worker';

    if (!needsChanges) {
      log.info(
        `No changes needed in config.toml - all required settings are already configured`
      );
      return false;
    }

    // Prepare diff-like changes summary
    const changes = [];

    // DB Pooler enabled
    if (currentSettings.poolerEnabled !== true) {
      changes.push(`[db.pooler]
${chalk.red(`- enabled = ${currentSettings.poolerEnabled}`)}
${chalk.green('+ enabled = true')}`);
    }

    // Pool mode
    if (currentSettings.poolMode !== 'transaction') {
      changes.push(`[db.pooler]
${chalk.red(`- pool_mode = "${currentSettings.poolMode}"`)}
${chalk.green('+ pool_mode = "transaction"')}`);
    }

    // Edge runtime policy
    if (currentSettings.edgeRuntimePolicy !== 'per_worker') {
      changes.push(`[edge_runtime]
${chalk.red(`- policy = "${currentSettings.edgeRuntimePolicy}"`)}
${chalk.green('+ policy = "per_worker"')}`);
    }

    // Show summary and ask for confirmation
    note(changes.join('\n\n'), 'Config Changes');

    const shouldContinue = await confirm({
      message: `Do you want to proceed with these configuration changes? A backup will be created at ${backupPath}`,
    });

    if (!shouldContinue) {
      log.info('Configuration update cancelled');
      return false;
    }

    // Create a backup of the original config file
    fs.copyFileSync(configPath, backupPath);
    log.info(`Created backup at ${backupPath}`);

    log.info(`Updating config.toml`);

    // Create updated configuration object
    const updatedConfig = { ...config };

    // Ensure db and pooler objects exist
    if (!updatedConfig.db) {
      updatedConfig.db = {};
    }

    if (!updatedConfig.db.pooler) {
      updatedConfig.db.pooler = {};
    }

    // 1. Enable the connection pooler
    updatedConfig.db.pooler.enabled = true;

    // 2. Ensure pool_mode is set to "transaction"
    updatedConfig.db.pooler.pool_mode = 'transaction';

    // 3. Update edge_runtime policy
    if (!updatedConfig.edge_runtime) {
      updatedConfig.edge_runtime = {};
    }
    updatedConfig.edge_runtime.policy = 'per_worker';

    // Use toml-patch to update the config while preserving comments and formatting
    const updatedContent = TOML.patch(configContent, updatedConfig);
    fs.writeFileSync(configPath, updatedContent);

    log.success(
      `Successfully updated ${configPath} (backup created at ${backupPath})`
    );
    return true; // Return true to indicate config was updated
  } catch (error) {
    log.error(
      `Failed to update ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
