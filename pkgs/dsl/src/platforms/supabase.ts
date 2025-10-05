import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Flow as CoreFlow,
  type AnyInput, type AnySteps, type AnyDeps,
  EmptySteps, EmptyDeps, type Env
} from '../index.js';

/* ---------- 1. Resources ------------------------------------------- */
export interface SupabaseResources extends Record<string, unknown> {
  sql            : Sql;
  /**
   * Supabase client with service role key for full database access
   */
  supabase       : SupabaseClient;
}

/* ---------- 2. Environment ----------------------------------------- */
export interface SupabaseEnv extends Env {
  EDGE_WORKER_DB_URL      : string;
  SUPABASE_URL            : string;
  SUPABASE_ANON_KEY      : string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SB_EXECUTION_ID         : string;
  EDGE_WORKER_LOG_LEVEL?  : string;
}

/* ---------- 3. Platform context ------------------------------------ */
// Platform context provides only platform-specific resources (sql, supabase)
// The env property is provided by FlowContext<TEnv> where TEnv defaults to SupabaseEnv
// Runtime validation of Supabase-specific env vars happens in SupabasePlatformAdapter
export type SupabasePlatformContext = SupabaseResources;

/* ---------- 4. pre-wired Flow helper -------------------------------- */
export class Flow<
  I extends AnyInput = AnyInput,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  CustomCtx extends Record<string, unknown> = {},
  S extends AnySteps = EmptySteps,
  D extends AnyDeps   = EmptyDeps,
  TEnv extends Env = SupabaseEnv  // Default to SupabaseEnv for platform-specific autocomplete
> extends CoreFlow<
  I,
  SupabasePlatformContext & CustomCtx,
  S, D,
  TEnv
> {}