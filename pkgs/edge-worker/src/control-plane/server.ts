import type { AnyFlow } from '@pgflow/dsl';
import { compileFlow } from '@pgflow/dsl';
import postgres from 'postgres';
import { MigrationRunner } from './migrations/MigrationRunner.ts';
import {
  validateServiceRoleAuth,
  createUnauthorizedResponse,
} from '../shared/authValidation.ts';
import { getSanitizedErrorMessage } from '../shared/errorSanitization.ts';

/**
 * Response type for the /flows/:slug endpoint
 */
export interface FlowCompilationResponse {
  flowSlug: string;
  sql: string[];
}

/**
 * Error response type
 */
export interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Input type for flow registration - accepts array or object (for namespace imports)
 */
export type FlowInput = AnyFlow[] | Record<string, AnyFlow>;

/**
 * Normalizes flow input to array format
 * @param flowsInput Array or object of flows
 * @returns Array of flows
 */
function normalizeFlowInput(flowsInput: FlowInput): AnyFlow[] {
  return Array.isArray(flowsInput) ? flowsInput : Object.values(flowsInput);
}

/**
 * Builds a flow registry and validates no duplicate slugs
 * @param flows Array of flow definitions
 * @returns Map of slug to flow
 */
function buildFlowRegistry(flows: AnyFlow[]): Map<string, AnyFlow> {
  const registry = new Map<string, AnyFlow>();

  for (const flow of flows) {
    if (registry.has(flow.slug)) {
      throw new Error(
        `Duplicate flow slug detected: '${flow.slug}'. Each flow must have a unique slug.`
      );
    }
    registry.set(flow.slug, flow);
  }

  return registry;
}

/**
 * Creates a request handler for the ControlPlane HTTP API
 * @param flowsInput Array or object of flow definitions to register
 * @returns Request handler function
 */
export function createControlPlaneHandler(flowsInput: FlowInput) {
  const flows = normalizeFlowInput(flowsInput);
  const registry = buildFlowRegistry(flows);

  return (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);

    // Supabase Edge Functions always include function name as first segment
    // Kong strips /functions/v1/ prefix, so handler receives: /pgflow/flows/slug
    // We strip /pgflow to get: /flows/slug
    const pathname = url.pathname.replace(/^\/[^/]+/, '');

    // Handle GET /flows/:slug
    const flowsMatch = pathname.match(/^\/flows\/([a-zA-Z0-9_]+)$/);
    if (flowsMatch && req.method === 'GET') {
      const slug = flowsMatch[1];
      return handleGetFlow(registry, slug);
    }

    // Handle GET /migrations/list
    if (pathname === '/migrations/list' && req.method === 'GET') {
      return handleMigrationsList(req);
    }

    // Handle POST /migrations/up
    if (pathname === '/migrations/up' && req.method === 'POST') {
      return handleMigrationsUp(req);
    }

    // Handle POST /secrets/configure
    if (pathname === '/secrets/configure' && req.method === 'POST') {
      return handleSecretsConfig(req);
    }

    // 404 for unknown routes
    return jsonResponse(
      {
        error: 'Not Found',
        message: `Route ${req.method} ${url.pathname} not found`,
      },
      404
    );
  };
}

/**
 * Serves the ControlPlane HTTP API for flow compilation
 * @param flowsInput Array or object of flow definitions to register
 */
export function serveControlPlane(flowsInput: FlowInput): void {
  const handler = createControlPlaneHandler(flowsInput);

  // Create HTTP server using Deno.serve (follows Supabase Edge Function pattern)
  Deno.serve({}, handler);
}

/**
 * Handles GET /flows/:slug requests
 */
function handleGetFlow(registry: Map<string, AnyFlow>, slug: string): Response {
  try {
    const flow = registry.get(slug);

    if (!flow) {
      return jsonResponse(
        {
          error: 'Flow Not Found',
          message: `Flow '${slug}' not found. Did you add it to supabase/functions/pgflow/index.ts?`,
        },
        404
      );
    }

    // Compile the flow to SQL
    const sql = compileFlow(flow);

    const response: FlowCompilationResponse = {
      flowSlug: slug,
      sql,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    console.error('Error compiling flow:', error);
    return jsonResponse(
      {
        error: 'Compilation Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * Helper to create JSON responses
 */
function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Gets environment variables, preferring Deno.env
 */
function getEnv(): Record<string, string | undefined> {
  return {
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_DB_URL: Deno.env.get('SUPABASE_DB_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  };
}

/**
 * Creates a postgres connection for migrations
 * Uses SUPABASE_DB_URL for direct connection (not pooler - better for DDL)
 */
function createInstallerSql(): postgres.Sql {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL environment variable is required');
  }
  return postgres(dbUrl, { prepare: false });
}

/**
 * Handles GET /migrations/list
 * Returns list of all migrations with their status (pending/applied)
 */
async function handleMigrationsList(req: Request): Promise<Response> {
  const env = getEnv();
  const authResult = validateServiceRoleAuth(req, env);
  if (!authResult.valid) {
    return createUnauthorizedResponse();
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = createInstallerSql();
    const runner = new MigrationRunner(sql);
    const migrations = await runner.list();

    return jsonResponse({ migrations }, 200);
  } catch (error) {
    const sanitizedMessage = getSanitizedErrorMessage(error, env);
    console.error('Error listing migrations:', sanitizedMessage);
    return jsonResponse(
      {
        error: 'Migration Error',
        message: sanitizedMessage,
      },
      500
    );
  } finally {
    if (sql) await sql.end();
  }
}

/**
 * Handles POST /migrations/up
 * Applies all pending migrations
 */
async function handleMigrationsUp(req: Request): Promise<Response> {
  const env = getEnv();
  const authResult = validateServiceRoleAuth(req, env);
  if (!authResult.valid) {
    return createUnauthorizedResponse();
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = createInstallerSql();
    const runner = new MigrationRunner(sql);
    const result = await runner.up();

    // Sanitize any error message in the result (from MigrationRunner)
    if (result.error) {
      result.error = getSanitizedErrorMessage({ message: result.error }, env);
    }

    return jsonResponse(result, result.success ? 200 : 500);
  } catch (error) {
    const sanitizedMessage = getSanitizedErrorMessage(error, env);
    console.error('Error applying migrations:', sanitizedMessage);
    return jsonResponse(
      {
        error: 'Migration Error',
        message: sanitizedMessage,
      },
      500
    );
  } finally {
    if (sql) await sql.end();
  }
}

/**
 * Handles POST /secrets/configure
 * Configures vault secrets needed for pgflow worker management
 */
async function handleSecretsConfig(req: Request): Promise<Response> {
  const env = getEnv();
  const authResult = validateServiceRoleAuth(req, env);
  if (!authResult.valid) {
    return createUnauthorizedResponse();
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = createInstallerSql();

    // Extract project ID from SUPABASE_URL (e.g., https://abc123.supabase.co -> abc123)
    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Configuration Error',
          message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        },
        500
      );
    }

    const projectId = extractProjectId(supabaseUrl);
    if (!projectId) {
      return jsonResponse(
        {
          error: 'Configuration Error',
          message: 'Could not extract project ID from SUPABASE_URL',
        },
        500
      );
    }

    // Upsert secrets (delete + create pattern) in single transaction
    await sql.begin(async (tx) => {
      await tx`DELETE FROM vault.secrets WHERE name = 'supabase_project_id'`;
      await tx`SELECT vault.create_secret(${projectId}, 'supabase_project_id')`;

      await tx`DELETE FROM vault.secrets WHERE name = 'supabase_service_role_key'`;
      await tx`SELECT vault.create_secret(${serviceRoleKey}, 'supabase_service_role_key')`;
    });

    return jsonResponse({
      success: true,
      configured: ['supabase_project_id', 'supabase_service_role_key'],
    }, 200);
  } catch (error) {
    const sanitizedMessage = getSanitizedErrorMessage(error, env);
    console.error('Error configuring secrets:', sanitizedMessage);
    return jsonResponse(
      {
        error: 'Secret Configuration Error',
        message: sanitizedMessage,
      },
      500
    );
  } finally {
    if (sql) await sql.end();
  }
}

/**
 * Extracts project ID from Supabase URL
 * @example https://abc123.supabase.co -> abc123
 * @example https://abc123.supabase.green -> abc123
 */
export function extractProjectId(supabaseUrl: string): string | null {
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\./);
  return match ? match[1] : null;
}
