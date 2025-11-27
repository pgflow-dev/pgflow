import fs from 'fs';
import path from 'path';
import { log, confirm } from '@clack/prompts';
import * as TOML from '@decimalturn/toml-patch';
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
 * @param options.autoConfirm - Whether to automatically confirm changes
 * @returns Promise<boolean> - True if changes were made, false otherwise
 */
export async function updateConfigToml({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  // Check Supabase configuration

  const configPath = path.join(supabasePath, 'config.toml');
  const backupPath = `${configPath}.backup`;

  try {
    if (!fs.existsSync(configPath)) {
      log.error(`config.toml not found at ${configPath}`);
      throw new Error(`config.toml not found at ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    let config: SupabaseConfig;
    try {
      config = TOML.parse(configContent) as SupabaseConfig;
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      log.error(`Invalid TOML syntax in ${configPath}: ${errorMsg}`);
      throw new Error(`Invalid TOML syntax in ${configPath}: ${errorMsg}`);
    }

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
      log.success('Supabase configuration is already set up for pgflow');
      return false;
    }

    const changes: string[] = [];

    // Connection pooler changes
    const poolerChanges: string[] = [];
    if (currentSettings.poolerEnabled !== true) {
      poolerChanges.push(`enabled = ${currentSettings.poolerEnabled} ${chalk.dim('->')} ${chalk.green('true')}`);
    }
    if (currentSettings.poolMode !== 'transaction') {
      poolerChanges.push(`pool_mode = "${currentSettings.poolMode}" ${chalk.dim('->')} ${chalk.green('"transaction"')}`);
    }
    if (poolerChanges.length > 0) {
      changes.push(`  ${chalk.bold('[db.pooler]')} ${chalk.dim('(required for pgflow worker)')}`);
      poolerChanges.forEach(change => changes.push(`    ${change}`));
    }

    // Edge runtime changes
    if (currentSettings.edgeRuntimePolicy !== 'per_worker') {
      changes.push(`  ${chalk.bold('[edge_runtime]')} ${chalk.dim('(required for long-running tasks)')}`);
      changes.push(`    policy = "${currentSettings.edgeRuntimePolicy}" ${chalk.dim('->')} ${chalk.green('"per_worker"')}`);
    }

    const summaryMsg = [
      `Update ${chalk.cyan('config.toml')}:`,
      '',
      ...changes,
    ].join('\n');

    log.info(summaryMsg);

    let shouldContinue = autoConfirm;

    if (!autoConfirm) {
      const confirmResult = await confirm({
        message: `Update config.toml? (backup will be created)`,
      });

      shouldContinue = confirmResult === true;
    }

    if (!shouldContinue) {
      log.warn('Configuration update skipped');
      return false;
    }

    // Update Supabase configuration

    // Create backup
    fs.copyFileSync(configPath, backupPath);

    const updatedConfig = { ...config };

    // Ensure required objects exist and set values
    if (!updatedConfig.db) updatedConfig.db = {};
    if (!updatedConfig.db.pooler) updatedConfig.db.pooler = {};
    if (!updatedConfig.edge_runtime) updatedConfig.edge_runtime = {};

    updatedConfig.db.pooler.enabled = true;
    updatedConfig.db.pooler.pool_mode = 'transaction';
    updatedConfig.edge_runtime.policy = 'per_worker';

    let updatedContent: string;
    try {
      updatedContent = TOML.patch(configContent, updatedConfig, {
        trailingComma: false,
      });
    } catch (stringifyError) {
      const errorMsg = stringifyError instanceof Error ? stringifyError.message : String(stringifyError);
      log.error(`Failed to generate TOML for ${configPath}: ${errorMsg}`);
      throw new Error(`Failed to generate TOML for ${configPath}: ${errorMsg}`);
    }

    try {
      fs.writeFileSync(configPath, updatedContent);
    } catch (writeError) {
      const errorMsg = writeError instanceof Error ? writeError.message : String(writeError);
      log.error(`Failed to write ${configPath}: ${errorMsg}`);
      throw new Error(`Failed to write ${configPath}: ${errorMsg}`);
    }

    log.success('Configuration updated');
    return true;
  } catch (error) {
    log.error(
      `Configuration update failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
