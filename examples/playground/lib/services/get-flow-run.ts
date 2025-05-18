// lib/services/get-flow-run.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { ResultRow } from '@/lib/db';

/**
 * Server-side function to fetch flow run data
 */
export async function getFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = await createClient();

  try {
    // Fetch the flow run data
    const { data, error } = await supabase
      .schema('pgflow')
      .from('runs')
      .select(
        `
        *,
        step_states!step_states_run_id_fkey(
          *,
          step:steps!inner(step_index)
        ),
        step_tasks!step_tasks_run_id_fkey(*)
      `,
      )
      .eq('run_id', runId)
      .single<ResultRow>();

    if (error) {
      return { data: null, error: `Error fetching run data: ${error.message}` };
    }

    return { data, error: null };
  } catch (err: any) {
    console.error('Error fetching flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the flow run data',
    };
  }
}