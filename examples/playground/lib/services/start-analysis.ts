// lib/services/start-analysis.ts
import { createClient } from '@/utils/supabase/client';
import { PgflowClient } from '@pgflow/client';

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
 * Starts analyse-website pgflow run and returns the run_id.
 * **This is the ONLY place that knows HOW we start a flow.**
 */
export async function startWebsiteAnalysis(
  url: string,
  { requireAuth = true, runId }: StartAnalysisOptions = {},
): Promise<string> {
  if (!url) throw new Error('URL is required');

  const supabase = createClient();

  // Get authenticated user (required for flow input)
  const { data, error: authError } = await supabase.auth.getUser();
  if (requireAuth && (!data.user || authError)) {
    const err = new Error('AUTH_REQUIRED');
    (err as any).code = 'AUTH_REQUIRED';
    throw err;
  }

  // Initialize PgflowClient and start flow
  const pgflow = new PgflowClient(supabase);
  
  try {
    const run = await pgflow.startFlow(
      'analyze_website',
      { 
        url, 
        user_id: data.user?.id || 'anonymous' 
      },
      runId
    );
    
    return run.run_id;
  } catch (error: any) {
    // Map PgflowClient errors to user-friendly messages
    if (error.message?.includes('FLOW_NOT_FOUND')) {
      throw new Error('The analyze_website flow is not available. Please check your setup.');
    }
    if (error.message?.includes('INVALID_INPUT_JSON')) {
      throw new Error('Invalid input provided for website analysis.');
    }
    
    // Re-throw original error for other cases
    throw error;
  }
}