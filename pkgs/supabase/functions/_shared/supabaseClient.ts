import { createClient } from "@supabase/supabase-js";

export function createAuthenticatedClient(req: Request) {
  const authHeader = req.headers.get("Authorization")!;
  return createClient(
    Deno.env.get("API_URL") ?? "",
    Deno.env.get("ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

export function createServiceRoleClient() {
  const API_URL = "http://host.docker.internal:54321";

  return createClient(API_URL, Deno.env.get("SERVICE_ROLE_KEY") ?? "");
}
