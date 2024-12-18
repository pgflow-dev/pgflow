const API_URL = "http://host.docker.internal:54321";

export default async function spawnNewEdgeFunction(
  functionName: string = "pgflow-worker",
  body: string = "",
  supabaseAnonKey: string = "",
): Promise<void> {
  if (!functionName) {
    throw new Error("functionName cannot be null or empty");
  }

  console.log("Spawning a new Edge Function...");

  const response = await fetch(`${API_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  console.log("Edge Function spawned successfully!");

  if (!response.ok) {
    throw new Error(
      `Edge function returned non-OK status: ${response.status} ${response.statusText}`,
    );
  }
}
