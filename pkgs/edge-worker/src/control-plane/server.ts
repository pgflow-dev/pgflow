import type { AnyFlow, FlowShape } from '@pgflow/dsl';
import { compileFlow } from '@pgflow/dsl';

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
 * Response type for the /flows/:slug/ensure-compiled endpoint
 */
export interface EnsureCompiledResponse {
  status: 'compiled' | 'verified' | 'recompiled' | 'mismatch';
  differences: string[];
}

/**
 * Request body for the /flows/:slug/ensure-compiled endpoint
 */
export interface EnsureCompiledRequest {
  shape: FlowShape;
  mode: 'development' | 'production';
}

/**
 * SQL function interface for database operations
 * Compatible with the postgres library's tagged template interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any
export type SqlFunction = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

/**
 * Options for configuring the ControlPlane handler
 */
export interface ControlPlaneOptions {
  /** SQL function for database operations (required for ensure-compiled endpoint) */
  sql?: SqlFunction;
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
 * @param options Optional configuration for database and authentication
 * @returns Request handler function
 */
export function createControlPlaneHandler(
  flowsInput: FlowInput,
  options?: ControlPlaneOptions
) {
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

    // Handle POST /flows/:slug/ensure-compiled
    const ensureCompiledMatch = pathname.match(
      /^\/flows\/([a-zA-Z0-9_]+)\/ensure-compiled$/
    );
    if (ensureCompiledMatch && req.method === 'POST') {
      const slug = ensureCompiledMatch[1];
      return handleEnsureCompiled(req, slug, options);
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
 * Verifies authentication using apikey header against SUPABASE_SERVICE_ROLE_KEY env var
 */
function verifyAuth(request: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return false;
  const apikey = request.headers.get('apikey');
  return apikey === serviceRoleKey;
}

/**
 * Validates the ensure-compiled request body
 */
function validateEnsureCompiledBody(
  body: unknown
): { valid: true; data: EnsureCompiledRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const { shape, mode } = body as Record<string, unknown>;

  if (!shape || typeof shape !== 'object') {
    return { valid: false, error: 'Missing or invalid shape in request body' };
  }

  if (mode !== 'development' && mode !== 'production') {
    return {
      valid: false,
      error: "Invalid mode: must be 'development' or 'production'",
    };
  }

  return { valid: true, data: { shape: shape as FlowShape, mode } };
}

/**
 * Handles POST /flows/:slug/ensure-compiled requests
 */
async function handleEnsureCompiled(
  request: Request,
  flowSlug: string,
  options?: ControlPlaneOptions
): Promise<Response> {
  // Check if SQL is configured
  if (!options?.sql) {
    return jsonResponse(
      {
        error: 'Not Found',
        message: 'ensure-compiled endpoint requires SQL configuration',
      },
      404
    );
  }

  // Verify authentication
  if (!verifyAuth(request)) {
    return jsonResponse(
      {
        error: 'Unauthorized',
        message: 'Invalid or missing apikey header',
      },
      401
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        error: 'Bad Request',
        message: 'Invalid JSON in request body',
      },
      400
    );
  }

  const validation = validateEnsureCompiledBody(body);
  if (!validation.valid) {
    return jsonResponse(
      {
        error: 'Bad Request',
        message: validation.error,
      },
      400
    );
  }

  const { shape, mode } = validation.data;

  // Call SQL function
  try {
    const [result] = await options.sql`
      SELECT pgflow.ensure_flow_compiled(
        ${flowSlug},
        ${JSON.stringify(shape)}::jsonb,
        ${mode}
      ) as result
    `;

    const response = result.result as EnsureCompiledResponse;

    return jsonResponse(response, response.status === 'mismatch' ? 409 : 200);
  } catch (error) {
    console.error('Error calling ensure_flow_compiled:', error);
    return jsonResponse(
      {
        error: 'Database Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}
