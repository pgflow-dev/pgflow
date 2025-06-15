import { Database } from '@/supabase/functions/database-types';

// Keep only the database type exports that might be needed elsewhere
export type RunRow = Database['pgflow']['Tables']['runs']['Row'];
export type StepStateRow = Database['pgflow']['Tables']['step_states']['Row'];
export type StepTaskRow = Database['pgflow']['Tables']['step_tasks']['Row'];

// Note: The observation functions and custom types have been removed
// as they are now handled by the @pgflow/client library