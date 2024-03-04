import { createAuthenticatedClient } from "../_shared/supabaseClient.ts";

export default async function isSuperadmin(req: Request) {
  const supabase = createAuthenticatedClient(req);
  const { error, data } = await supabase.rpc("is_superadmin");

  return data && !error;
}
