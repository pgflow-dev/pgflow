import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types.d.ts";

export function createAuthenticatedClient(req: Request) {
  const authHeader = req.headers.get("Authorization")!;
  return createClient<Database>(
    Deno.env.get("API_URL") ?? "",
    Deno.env.get("ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

export function createServiceRoleClient(): SupabaseClient {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}
