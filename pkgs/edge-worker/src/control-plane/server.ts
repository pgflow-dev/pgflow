import type { AnyFlow } from '@pgflow/dsl';
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
