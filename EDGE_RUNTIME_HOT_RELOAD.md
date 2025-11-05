## Edge Functions Hot Reload Without `functions serve`

When you run `supabase start` only (without `supabase functions serve`), Edge Functions **do not hot reload automatically** when you change the code. The Edge Functions runtime that starts with `supabase start` serves the functions, but it doesn't watch for file changes or reload them automatically.[1][2]

Here's what happens in each scenario:

**With `supabase start` only:**

- The Edge Functions runtime starts and serves your functions
- Functions are accessible at `http://localhost:54321/functions/v1/[function-name]`
- Code changes **require a manual restart** (`supabase stop` then `supabase start`) to take effect
- This process takes a while since it restarts the entire Docker stack[1]

**With `supabase functions serve [function-name]`:**

- Hot reloading is enabled by default
- The function automatically reloads when you save changes to the code
- Changes are reflected instantly without needing to restart anything[3][4]
- The watcher process monitors your function files for changes

**Why the difference:**

The `functions serve` command specifically includes a file watcher that monitors your function code for changes and triggers automatic reloads. This is a development convenience feature separate from the base Edge Functions runtime that runs with `supabase start`.[4][3]

**Best practice for development:**

Run both commands together:

```bash
supabase start              # Starts all services including Edge Functions runtime
supabase functions serve [function-name]  # Enables hot reload for development
```

This gives you the full local stack plus hot reloading for fast iteration. Without `functions serve`, you're stuck doing manual restarts to see code changes, which significantly slows down development.[2][1]

[1](https://www.reddit.com/r/Supabase/comments/1ebjw82/restarting_edge_functions_locally/)
[2](https://supabase.com/docs/guides/cli/config)
[3](https://supabase.com/docs/guides/functions/development-environment)
[4](https://supabase.com/docs/guides/functions/quickstart)
[5](https://supabase.com/blog/supabase-dynamic-functions)
[6](https://github.com/orgs/supabase/discussions/6786)
[7](https://supabase.com/blog/edge-functions-faster-smaller)
[8](https://github.com/supabase/cli/issues/247)
[9](https://supabase.com/docs/guides/local-development/overview)
[10](https://github.com/orgs/supabase/discussions/36109)
[11](https://www.answeroverflow.com/m/1036625056467533905)
[12](https://www.youtube.com/watch?v=BceVcpiOlKM)
[13](https://github.com/supabase/edge-runtime/issues/306)
[14](https://trigger.dev/docs/guides/frameworks/supabase-edge-functions-basic)
[15](https://github.com/orgs/supabase/discussions/9837)
[16](https://www.reddit.com/r/Supabase/comments/1fgu7bb/supabase_edge_functions_are_not_production_ready/)
[17](https://supabase.com/docs/guides/functions)
[18](https://supabase.com/blog/edge-functions-background-tasks-websockets)
[19](https://supabase.com/blog/edge-runtime-self-hosted-deno-functions)
[20](https://github.com/supabase/edge-runtime/issues/212)
[21](https://supabase.com/edge-functions)
[22](https://github.com/orgs/supabase/discussions/33235)
[23](https://supabase.com/docs/reference/cli/introduction)
[24](https://supabase.com/docs/guides/functions/troubleshooting)
[25](https://stackoverflow.com/questions/78783338/unable-to-run-supabase-edge-functions-locally)
[26](https://ethanmick.com/using-supabases-edge-runtime-to-supercharge-your-app/)
[27](https://docs.weweb.io/workflows/actions/supabase/invoke-edge-function.html)
[28](https://supabase.com/blog/supabase-edge-functions-deploy-dashboard-deno-2-1)
[29](https://supabase.com/docs/reference/javascript/auth-startautorefresh)
[30](https://github.com/orgs/supabase/discussions/37271)
[31](https://supabase.com/docs/guides/troubleshooting/edge-function-shutdown-reasons-explained)
