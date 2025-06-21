// lib/services/start-analysis.ts
import { createClient } from '@/utils/supabase/client';
import type { FlowRun, PgflowClient } from '@pgflow/client';
import type { AnyFlow } from '@pgflow/dsl';

export interface StartAnalysisOptions {
  /**
   * If true, throws an AuthRequiredError when the user is not logged in.
   * If false, function continues but you can handle unauthenticated state yourself.
   */
  requireAuth?: boolean;
  /**
   * Predetermined run id (useful for optimistic UI / testing).
   */
  runId?: string;
}

/**
 * Starts analyse-website pgflow run and returns the FlowRun instance.
 * **This is the ONLY place that knows HOW we start a flow.**
 */
export async function startWebsiteAnalysis(
  url: string,
  { requireAuth = true, runId }: StartAnalysisOptions = {},
  pgflow: PgflowClient
): Promise<FlowRun<AnyFlow>> {
  if (!url) throw new Error('URL is required');
  if (!pgflow) throw new Error('PgflowClient is required');

  const supabase = createClient();

  // optional auth guard
  if (requireAuth) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const err = new Error('AUTH_REQUIRED') as Error & {code?: string};
      // tiny custom error class makes catching easier
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
  }

  // Get the user ID for the flow input
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const flowRun = await pgflow.startFlow(
    'analyze_website',
    { url, user_id: userId },
    runId
  );
  
  return flowRun;
}