# Supabase Locking Mechanism

## Overview

Each package in the monorepo has its own Supabase instance with separate ports and locks. The locking mechanism prevents parallel starts of the same instance, but does not block different packages from starting their own instances simultaneously.

## How It Works

### Lock Scope

- **Per-package locks**: Each package (core, edge-worker, client, website) gets its own lock based on its absolute directory path
- **Independent instances**: Different packages can start their Supabase instances in parallel without blocking each other
- **Serialized starts**: Multiple Nx targets in the same package that need Supabase will wait for each other

### Lock Files

- **Location**: `/tmp/supabase-start-<hash>.lock`
- **Hash**: MD5 of the absolute project directory path
- **Port range**: 40000-49999 (derived from first 8 hex chars of hash)
- **Lock mechanism**: TCP port binding via netcat (NFS-safe alternative to flock)

### Port Binding Approach

We use TCP port binding instead of file locking (flock) because:

1. **NFS compatibility**: GitHub Actions uses NFS storage where flock is unreliable
2. **OS-managed cleanup**: Kernel automatically releases ports on process death (no orphaned locks)
3. **Platform independence**: Works consistently across different filesystems

## Package Ports

Each package uses a distinct set of ports to avoid conflicts:

| Package     | DB Port | API Port | Shadow Port | Pooler Port | Other Ports      |
| ----------- | ------- | -------- | ----------- | ----------- | ---------------- |
| core        | 50422   | 50421*   | 50420       | -           | 50323 (studio*)  |
| edge-worker | 50322   | 50321    | 50320       | 50329       | 8083 (inspector) |
| client      | 50522   | 50521    | 50520       | 50529       | -                |
| website     | 55322   | 55321    | 55320       | -           | 55323, 55324     |

_* = disabled in config_

**Lock port range**: 40000-49999 (well separated from Supabase service ports)

## Usage in Nx Targets

### Cacheable Targets

Targets that need Supabase can call `supabase-start-locked.sh` directly and still be cacheable:

```json
{
  "verify-migrations": {
    "executor": "nx:run-commands",
    "cache": true,
    "options": {
      "cwd": "{projectRoot}",
      "commands": [
        "../../scripts/supabase-start-locked.sh $(pwd)",
        "supabase db reset > .nx-inputs/verify-migrations.txt"
      ]
    }
  }
}
```

### Why This Works

1. **Short-lived processes**: Targets run, use the database, produce output, and exit
2. **Idempotent starts**: `supabase-start.sh` checks if already running (fast path)
3. **Lock serialization**: Only one target per package can start Supabase at a time
4. **Cache flexibility**:
   - If first target starts Supabase → second target finds it running
   - If first target loads from cache → second target starts Supabase fresh

### Manual Operations

The following targets are **intentionally not locked** as they're for manual use only:

- `supabase:stop`
- `supabase:restart`
- `supabase:status`

These targets are not part of automated workflows via `dependsOn`, so they don't need lock protection.

## Scripts

### supabase-start-locked.sh (Wrapper)

**Purpose**: Provides lock-protected access to the Supabase start worker script.

**Responsibilities**:

- Normalizes project directory to absolute path
- Computes unique lock file path based on directory hash
- Delegates to `port-lock.sh` for lock acquisition
- Passes control to `supabase-start.sh` when lock is acquired

**Usage**:

```bash
../../scripts/supabase-start-locked.sh $(pwd)
```

### port-lock.sh (Lock Manager)

**Purpose**: NFS-safe locking mechanism using TCP port binding.

**How it works**:

1. Derives unique port (40000-49999) from lockfile path via MD5 hash
2. Attempts to bind to that port with netcat
3. If bind succeeds: holds lock and runs command
4. If bind fails: waits with timeout (60s) and retries
5. OS automatically releases port on process exit

**Features**:

- 8-hex-char hash (4.2B possible ports, very low collision probability)
- 60-second timeout with progress indicators
- Automatic cleanup on process death

### supabase-start.sh (Worker)

**Purpose**: Idempotent Supabase startup with health verification.

**Behavior**:

1. **Fast path**: Checks if already running → exits immediately if yes
2. **Cleanup**: Stops stale containers and releases ports if needed
3. **Start**: Launches Supabase with `pnpm exec supabase start`
4. **Health check**: Verifies readiness with 30-second retry loop
5. **Progress**: Shows status every 5 seconds during health check

**Exit codes**:

- `0`: Success (Supabase is running and healthy)
- `1`: Failure (could not start or verify Supabase)

## Troubleshooting

### Port Conflicts

If you see "Port X is still in use" errors:

1. Check what's using the port: `ss -lpn | grep :PORT`
2. Stop the process or wait for automatic cleanup
3. If persistent, manually kill: `kill -9 PID`

### Lock Timeout

If you see "Timeout waiting for lock after 60s":

1. Check if another process is stuck: `ss -lpn | grep :40` (shows locks in 40000-49999 range)
2. Wait for timeout or kill the stuck process
3. First-time Supabase starts may take longer (downloading images)

### Stale Containers

If containers don't stop gracefully:

1. The script will force cleanup after 30s
2. Manual cleanup: `docker ps -a | grep supabase | awk '{print $1}' | xargs docker rm -f`

### Health Check Failures

If "Supabase started but not responding to status check":

1. Check Docker daemon is running: `docker info`
2. Check available disk space: `df -h`
3. Check Docker logs: `docker logs <container-id>`
4. Try manual restart: `pnpm nx run <package>:supabase:restart`

## Implementation Notes

### Why Not Shared Locks?

Q: Why doesn't each package share the same lock?
A: Each package runs its own Supabase instance on different ports. They can (and should) start independently without blocking each other.

### Why Not Lock Stop/Restart?

Q: Why aren't `supabase:stop` and `supabase:restart` locked?
A: These are manual convenience targets, not used in automated workflows via `dependsOn`. Users invoke them directly, so lock protection isn't necessary.

### Caching Strategy

Nx caching works because:

1. **Inputs are deterministic**: Migrations, schemas, tests don't change randomly
2. **Outputs are reproducible**: Same inputs → same outputs
3. **Supabase state is transient**: DB state doesn't affect cached outputs
4. **Lock prevents races**: Only one target per package starts Supabase at a time

### Migration Safety

Q: What prevents race conditions when copying migrations (e.g., edge-worker copying from core)?
A: Migration copy happens in `supabase:prepare` target which:

- Depends on `^verify-migrations` (ensures core migrations are stable)
- Runs before `supabase-start-locked.sh` is called
- Uses simple file copy (no concurrent writes)

## Future Improvements

- [ ] Consider making timeout configurable via environment variable
- [ ] Add telemetry for lock wait times in CI
- [ ] Investigate whether `serve:functions:e2e` continuous target needs special handling
