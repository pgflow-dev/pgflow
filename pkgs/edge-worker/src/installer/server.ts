import type { InstallerResult, StepResult } from './types.ts';
import postgres from 'postgres';
import { MigrationRunner } from '../control-plane/migrations/index.ts';
import { extractProjectId } from '../control-plane/server.ts';

// Dependency injection for testability
export interface InstallerDeps {
  getEnv: (key: string) => string | undefined;
}

const defaultDeps: InstallerDeps = {
  getEnv: (key) => Deno.env.get(key),
};

export function createInstallerHandler(
  expectedToken: string,
  deps: InstallerDeps = defaultDeps
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // Validate token from query params first (fail fast)
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (token !== expectedToken) {
      return jsonResponse(
        {
          success: false,
          message:
            'Invalid or missing token. Use the exact URL from your Lovable prompt.',
        },
        401
      );
    }

    // Read env vars inside handler (not at module level)
    const supabaseUrl = deps.getEnv('SUPABASE_URL');
    const serviceRoleKey = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const dbUrl = deps.getEnv('SUPABASE_DB_URL');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          success: false,
          message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        },
        500
      );
    }

    if (!dbUrl) {
      return jsonResponse(
        {
          success: false,
          message: 'Missing SUPABASE_DB_URL',
        },
        500
      );
    }

    console.log('pgflow installer starting...');

    // Create database connection
    const sql = postgres(dbUrl, { prepare: false });

    let secrets: StepResult;
    let migrations: StepResult;

    try {
      // Step 1: Configure vault secrets
      console.log('Configuring vault secrets...');
      secrets = await configureSecrets(sql, supabaseUrl, serviceRoleKey);

      if (!secrets.success) {
        const result: InstallerResult = {
          success: false,
          secrets,
          migrations: {
            success: false,
            status: 0,
            error: 'Skipped - secrets failed',
          },
          message: 'Failed to configure vault secrets.',
        };
        return jsonResponse(result, 500);
      }

      // Step 2: Run migrations
      console.log('Running migrations...');
      migrations = await runMigrations(sql);

      const result: InstallerResult = {
        success: secrets.success && migrations.success,
        secrets,
        migrations,
        message: migrations.success
          ? 'pgflow installed successfully! Vault secrets configured and migrations applied.'
          : 'Secrets configured but migrations failed. Check the error details.',
      };

      console.log('Installer complete:', result.message);
      return jsonResponse(result, result.success ? 200 : 500);
    } finally {
      await sql.end();
    }
  };
}

/**
 * Configure vault secrets for pgflow
 */
async function configureSecrets(
  sql: postgres.Sql,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<StepResult> {
  try {
    const projectId = extractProjectId(supabaseUrl);
    if (!projectId) {
      return {
        success: false,
        status: 500,
        error: 'Could not extract project ID from SUPABASE_URL',
      };
    }

    // Upsert secrets (delete + create pattern) in single transaction
    await sql.begin(async (tx) => {
      await tx`DELETE FROM vault.secrets WHERE name = 'supabase_project_id'`;
      await tx`SELECT vault.create_secret(${projectId}, 'supabase_project_id')`;

      await tx`DELETE FROM vault.secrets WHERE name = 'supabase_service_role_key'`;
      await tx`SELECT vault.create_secret(${serviceRoleKey}, 'supabase_service_role_key')`;
    });

    return {
      success: true,
      status: 200,
      data: { configured: ['supabase_project_id', 'supabase_service_role_key'] },
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run pending migrations
 */
async function runMigrations(sql: postgres.Sql): Promise<StepResult> {
  try {
    const runner = new MigrationRunner(sql);
    const result = await runner.up();

    return {
      success: result.success,
      status: result.success ? 200 : 500,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
