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
  const startTime = performance.now();
  console.log('🚀 startWebsiteAnalysis started:', { url, runId });
  
  if (!url) throw new Error('URL is required');

  const supabase = createClient();

  // Get authenticated user (required for flow input)
  console.log('⏳ Getting authenticated user...');
  const authStart = performance.now();
  const { data, error: authError } = await supabase.auth.getUser();
  const authEnd = performance.now();
  console.log(`✅ Auth check completed in ${(authEnd - authStart).toFixed(2)}ms`);
  
  if (requireAuth && (!data.user || authError)) {
    const err = new Error('AUTH_REQUIRED');
    (err as any).code = 'AUTH_REQUIRED';
    throw err;
  }

  // Initialize PgflowClient and start flow
  console.log('⏳ Initializing PgflowClient...');
  const clientStart = performance.now();
  const pgflow = new PgflowClient(supabase);
  const clientEnd = performance.now();
  console.log(`✅ PgflowClient initialized in ${(clientEnd - clientStart).toFixed(2)}ms`);

  try {
    console.log('⏳ Starting flow with pgflow.startFlow()...');
    const flowStart = performance.now();
    const run = await pgflow.startFlow(
      'analyze_website',
      {
        url,
        user_id: data.user?.id || 'anonymous',
      },
      runId,
    );
    const flowEnd = performance.now();
    console.log(`✅ Flow started in ${(flowEnd - flowStart).toFixed(2)}ms, run_id: ${run.run_id}`);

    // Store the initial run data to avoid unnecessary fetch
    console.log('⏳ Caching initial run data...');
    const cacheStart = performance.now();
    const initialRunData = {
      ...run.run,
      step_states: run.stepStates || [],
      step_tasks: [] // Will be populated by real-time updates
    };
    
    // Cache the data in sessionStorage for the FlowRunProvider
    sessionStorage.setItem(`flow_run_${run.run_id}`, JSON.stringify(initialRunData));
    const cacheEnd = performance.now();
    console.log(`✅ Data cached in ${(cacheEnd - cacheStart).toFixed(2)}ms`);

    const totalTime = performance.now() - startTime;
    console.log(`🎉 startWebsiteAnalysis completed in ${totalTime.toFixed(2)}ms total`);
    
    return run.run_id;
  } catch (error: any) {
    // Map PgflowClient errors to user-friendly messages
    if (error.message?.includes('FLOW_NOT_FOUND')) {
      throw new Error(
        'The analyze_website flow is not available. Please check your setup.',
      );
    }
    if (error.message?.includes('INVALID_INPUT_JSON')) {
      throw new Error('Invalid input provided for website analysis.');
    }

    // Re-throw original error for other cases
    throw error;
  }
}
