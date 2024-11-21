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
  const API_URL = "http://host.docker.internal:54321";

  return createClient(API_URL, Deno.env.get("SERVICE_ROLE_KEY") ?? "");
}
