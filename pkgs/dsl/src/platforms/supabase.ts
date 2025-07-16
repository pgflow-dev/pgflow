import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Flow as CoreFlow,
  type AnyInput, type AnySteps, type AnyDeps,
  EmptySteps, EmptyDeps, type Env, type UserEnv, type ValidEnv,
  type AnyFlow, type Json, type BaseContext
} from '../index.js';

/* ---------- 1. Resources ------------------------------------------- */
export interface SupabaseResources extends Record<string, unknown> {
  sql            : Sql;
  anonSupabase   : SupabaseClient;
  serviceSupabase: SupabaseClient;
}

/* ---------- 2. Environment ----------------------------------------- */
export interface SupabaseEnv extends Env {
  EDGE_WORKER_DB_URL      : string;
  SUPABASE_URL            : string;
  SUPABASE_ANON_KEY       : string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SB_EXECUTION_ID         : string;
  EDGE_WORKER_LOG_LEVEL?  : string;
}

/* ---------- 3. Platform context ------------------------------------ */
export type SupabasePlatformContext =
  BaseContext & SupabaseResources & {
    env: SupabaseEnv & ValidEnv<UserEnv>;
  };

/* ---------- 4. Execution contexts ---------------------------------- */
export type SupabaseMessageContext<T extends Json = Json> =
  SupabasePlatformContext & {
    rawMessage: any; // Will be properly typed by edge-worker
  };

export type SupabaseStepTaskContext<F extends AnyFlow = AnyFlow> =
  SupabasePlatformContext & {
    rawMessage: any; // Will be properly typed by edge-worker
    stepTask: any;   // Will be properly typed by edge-worker
  };

/* ---------- 5. pre-wired Flow helper -------------------------------- */
export class Flow<
  I extends AnyInput = AnyInput,
  ExtraCtx extends Record<string, unknown> = Record<string, never>,
  S extends AnySteps = EmptySteps,
  D extends AnyDeps   = EmptyDeps,
> extends CoreFlow<
  I,
  SupabasePlatformContext & ExtraCtx,   // <── full ctx in handlers
  S, D
> {}