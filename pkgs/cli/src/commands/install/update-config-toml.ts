import fs from 'fs';
import path from 'path';
import { log, confirm, note } from '@clack/prompts';
import * as TOML from 'toml-patch';
import chalk from 'chalk';

/**
 * Type definition for the parsed config.toml structure
 */
type SupabaseConfig = {
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
 * @returns Promise<boolean> - True if changes were made, false otherwise
 */
export async function updateConfigToml({
  supabasePath,
}: {
  supabasePath: string;
}): Promise<boolean> {
  const configPath = path.join(supabasePath, 'config.toml');
  const backupPath = `${configPath}.backup`;

  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`config.toml not found at ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = TOML.parse(configContent) as SupabaseConfig;

    const currentSettings = {
      poolerEnabled: config.db?.pooler?.enabled ?? false,
      poolMode: config.db?.pooler?.pool_mode ?? 'none',
      edgeRuntimePolicy: config.edge_runtime?.policy ?? 'oneshot',
    };

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

    const changes = [];

    if (currentSettings.poolerEnabled !== true) {
      changes.push(`[db.pooler]
${chalk.red(`- enabled = ${currentSettings.poolerEnabled}`)}
${chalk.green('+ enabled = true')}`);
    }

    if (currentSettings.poolMode !== 'transaction') {
      changes.push(`[db.pooler]
${chalk.red(`- pool_mode = "${currentSettings.poolMode}"`)}
${chalk.green('+ pool_mode = "transaction"')}`);
    }

    if (currentSettings.edgeRuntimePolicy !== 'per_worker') {
      changes.push(`[edge_runtime]
${chalk.red(`- policy = "${currentSettings.edgeRuntimePolicy}"`)}
${chalk.green('+ policy = "per_worker"')}`);
    }

    note(changes.join('\n\n'), 'Config Changes');

    const shouldContinue = await confirm({
      message: `Do you want to proceed with these configuration changes? A backup will be created at ${backupPath}`,
    });

    if (!shouldContinue) {
      log.info('Configuration update cancelled');
      return false;
    }

    fs.copyFileSync(configPath, backupPath);
    log.info(`Created backup at ${backupPath}`);
    log.info(`Updating config.toml`);

    const updatedConfig = { ...config };

    // Ensure required objects exist and set values
    if (!updatedConfig.db) updatedConfig.db = {};
    if (!updatedConfig.db.pooler) updatedConfig.db.pooler = {};
    if (!updatedConfig.edge_runtime) updatedConfig.edge_runtime = {};

    updatedConfig.db.pooler.enabled = true;
    updatedConfig.db.pooler.pool_mode = 'transaction';
    updatedConfig.edge_runtime.policy = 'per_worker';

    const updatedContent = TOML.patch(configContent, updatedConfig);
    fs.writeFileSync(configPath, updatedContent);

    log.success(
      `Successfully updated ${configPath} (backup created at ${backupPath})`
    );
    return true;
  } catch (error) {
    log.error(
      `Failed to update ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
