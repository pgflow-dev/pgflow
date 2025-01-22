import { getLogger } from './Logger.ts';

// @ts-ignore - TODO: fix the types
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;

const logger = getLogger('spawnNewEdgeFunction');

export default async function spawnNewEdgeFunction(
  functionName: string = 'edge-worker'
): Promise<void> {
  if (!functionName) {
    throw new Error('functionName cannot be null or empty');
  }

  logger.debug('Spawning a new Edge Function...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      // Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    // body: JSON.stringify(body),
  });

  logger.debug('Edge Function spawned successfully!');

  if (!response.ok) {
    throw new Error(
      `Edge function returned non-OK status: ${response.status} ${response.statusText}`
    );
  }
}
