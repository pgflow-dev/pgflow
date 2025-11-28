# PLAN: pgflow workers start CLI Command

**Created**: 2025-11-28
**Status**: Future Work
**Related**: PLAN_auth-verification.md

---

## Goal

Provide a CLI command to start workers with proper authentication, eliminating the need for manual curl commands.

---

## Command Design

```bash
# Uses SUPABASE_SERVICE_ROLE_KEY from env or .env
pgflow workers start greet-user-worker

# Or explicit key
pgflow workers start greet-user-worker --secret-key <key>

# Multiple workers
pgflow workers start greet-user-worker payment-worker
```

---

## Behavior

### Key Resolution

1. Check `--secret-key` flag
2. Check `SUPABASE_SERVICE_ROLE_KEY` env var
3. Check `.env` file in current directory
4. Check `supabase/.env` file
5. Error if no key found

### Request Handling

- Call worker endpoint with proper `apikey` header
- Handle HTTP responses and errors
- Display worker status/logs
- Handle reconnection on disconnect

### URL Resolution

- Default: `http://localhost:54321/functions/v1/<worker-name>`
- Support `--url` flag for custom endpoints
- Support `SUPABASE_URL` env var for hosted

---

## Implementation

### Files to Create/Modify

- `pkgs/cli/src/commands/workers/start.ts` - New command
- `pkgs/cli/src/commands/workers/index.ts` - Command group

### Command Structure

```typescript
import { Command } from 'commander';

export const workersStartCommand = new Command('start')
  .description('Start a worker to process tasks')
  .argument('<worker...>', 'Worker function name(s)')
  .option('--secret-key <key>', 'Service role / secret key')
  .option('--url <url>', 'Supabase functions URL')
  .action(async (workers, options) => {
    const secretKey = resolveSecretKey(options);

    for (const worker of workers) {
      await startWorker(worker, secretKey, options.url);
    }
  });

async function startWorker(name: string, secretKey: string, baseUrl?: string) {
  const url = `${baseUrl || getDefaultUrl()}/functions/v1/${name}`;

  const response = await fetch(url, {
    headers: {
      'apikey': secretKey,
    },
  });

  // Handle response, reconnection, etc.
}
```

### Key Resolution Function

```typescript
function resolveSecretKey(options: { secretKey?: string }): string {
  // 1. CLI flag
  if (options.secretKey) return options.secretKey;

  // 2. Env var
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // 3. .env file
  const envPath = findEnvFile();
  if (envPath) {
    const env = dotenv.parse(fs.readFileSync(envPath));
    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      return env.SUPABASE_SERVICE_ROLE_KEY;
    }
  }

  throw new Error('No secret key found. Provide --secret-key or set SUPABASE_SERVICE_ROLE_KEY');
}
```

---

## UX Considerations

### Output Format

```
$ pgflow workers start greet-user-worker

Starting worker: greet-user-worker
  URL: http://localhost:54321/functions/v1/greet-user-worker
  Auth: Using SUPABASE_SERVICE_ROLE_KEY from environment

Worker started successfully. Press Ctrl+C to stop.
```

### Error Messages

```
$ pgflow workers start greet-user-worker

Error: No secret key found.

To fix this, either:
  1. Set SUPABASE_SERVICE_ROLE_KEY environment variable
  2. Add SUPABASE_SERVICE_ROLE_KEY to your .env file
  3. Use --secret-key flag: pgflow workers start greet-user-worker --secret-key <key>
```

---

## When to Implement

After:
- Auth verification is implemented (PLAN_auth-verification.md)
- Basic worker functionality is stable
- User feedback indicates need for easier worker management

---

## Future Enhancements

- `pgflow workers list` - List available workers
- `pgflow workers status` - Show running workers
- `pgflow workers stop` - Stop running workers
- Watch mode for development
- Multiple worker instances with `--concurrency` flag
