import fs from 'fs';
import path from 'path';
import { log } from '@clack/prompts';
import * as TOML from '@iarna/toml';

/**
 * Updates the config.toml file with necessary configurations for EdgeWorker
 *
 * Makes the following changes:
 * 1. Enables the connection pooler
 * 2. Ensures pool_mode is set to "transaction"
 * 3. Changes edge_runtime policy from "oneshot" to "per_worker"
 *
 * @param options.supabasePath - Path to the supabase directory
 */
export function updateConfigToml({
  supabasePath,
}: {
  supabasePath: string;
}): void {
  log.step(`Updating config.toml`);

  const configPath = path.join(supabasePath, 'config.toml');

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
      functions?: {
        edge_runtime?: {
          policy?: string;
        };
      };
    };

    // Update pooler configuration
    if (!config.db) {
      config.db = {};
    }

    if (!config.db.pooler) {
      config.db.pooler = {};
    }

    // 1. Enable the connection pooler
    config.db.pooler.enabled = true;

    // 2. Ensure pool_mode is set to "transaction"
    config.db.pooler.pool_mode = 'transaction';

    // 3. Update edge_runtime policy
    if (config.functions && config.functions.edge_runtime) {
      config.functions.edge_runtime.policy = 'per_worker';
    } else if (config.functions) {
      config.functions.edge_runtime = { policy: 'per_worker' };
    } else {
      config.functions = {
        edge_runtime: { policy: 'per_worker' },
      };
    }

    // Convert back to TOML and write to file
    const updatedContent = TOML.stringify(config);
    fs.writeFileSync(configPath, updatedContent);

    log.success(`Successfully updated ${configPath}`);
  } catch (error) {
    log.error(
      `Failed to update ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
