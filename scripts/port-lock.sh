#!/bin/bash
set -e

# ============================================================================
# Port-Based Locking Script - Drop-in Replacement for flock
# ============================================================================
# This script provides file-lock semantics using TCP port binding instead of
# file locking, solving NFS compatibility issues in CI environments.
#
# PURPOSE:
#   Replace flock for environments where file locking is unreliable (NFS, etc.)
#   Uses TCP port binding as mutex - OS guarantees only one process can bind.
#
# USAGE:
#   port-lock.sh <lockfile> <command> [args...]
#
#   Same interface as flock - lockfile path determines port number.
#   Runs command when lock acquired, releases on exit.
#
# HOW IT WORKS:
#   1. Derives unique port (40000-49999) from lockfile path via md5 hash
#   2. Attempts to bind to that port with nc (netcat) in listen mode
#   3. If bind succeeds: runs command and holds lock until exit
#   4. If bind fails: another process holds lock, retry with timeout
#   5. OS automatically releases port on process exit (even crashes)
#
# CRITICAL: Must use 'nc -l PORT' without address - passing an address
# makes nc act as client and exit immediately, breaking the lock!
#
# KEY ADVANTAGE OVER FILE LOCKS:
#   Port binding is kernel-managed, not filesystem-dependent.
#   OS always releases ports on process death - no orphaned locks.
#
# PORT RANGE:
#   40000-49999 (10,000 ports available)
#   - Below Supabase ports (50000+, 54000+, 55000+)
#   - Above system/registered ports (0-32767)
#   - Non-privileged (no root needed)
#
# PLATFORM:
#   Linux with GNU netcat
#   Tested on: Manjaro, Ubuntu (GitHub Actions)
# ============================================================================

# Configuration
LOCK_PORT_BASE=40000        # Start of safe port range
LOCK_PORT_RANGE=10000       # 40000-49999
MAX_WAIT_SECONDS=180        # Timeout for lock acquisition (3 minutes for CI)
PROGRESS_INTERVAL=5         # Show progress every N seconds

# Global state
NC_PID=""                   # Background nc process ID

# ============================================================================
# Usage and Validation
# ============================================================================

usage() {
    echo "Usage: $0 <lockfile> <command> [args...]" >&2
    echo "" >&2
    echo "Drop-in replacement for flock using port-based locking." >&2
    echo "" >&2
    echo "Arguments:" >&2
    echo "  lockfile  - Path used to derive unique port number" >&2
    echo "  command   - Command to run while holding lock" >&2
    echo "  args      - Optional arguments passed to command" >&2
    exit 1
}

if [ $# -lt 2 ]; then
    echo "Error: Insufficient arguments" >&2
    usage
fi

LOCKFILE="$1"
shift
# Note: We keep the remaining arguments in $@ to preserve quoting
# DO NOT capture in COMMAND variable - it would lose quote boundaries

# ============================================================================
# Port Derivation
# ============================================================================

# Generate unique port from lockfile path (same approach as flock version)
# Returns port number in range 40000-49999
generate_lock_port() {
    local lockfile="$1"

    # Normalize to absolute path for consistent hashing
    local lockfile_abs
    if [ -e "$lockfile" ]; then
        lockfile_abs=$(realpath "$lockfile" 2>/dev/null || echo "$lockfile")
    else
        # For non-existent files, use the path as-is
        lockfile_abs="$lockfile"
    fi

    # Hash the path and convert to port number
    local hash=$(echo "$lockfile_abs" | md5sum | cut -d' ' -f1)

    # Convert first 8 hex chars to decimal, mod range, add to base
    local offset=$((0x${hash:0:8} % LOCK_PORT_RANGE))
    echo $((LOCK_PORT_BASE + offset))
}

# ============================================================================
# Lock Management
# ============================================================================

# Release lock by killing nc process
release_lock() {
    if [ -n "$NC_PID" ]; then
        kill "$NC_PID" 2>/dev/null || true
        wait "$NC_PID" 2>/dev/null || true
        NC_PID=""
    fi
    trap - EXIT INT TERM
}

# Try to acquire lock by binding to port
# Returns 0 on success, 1 on failure (port already bound)
acquire_lock() {
    local port="$1"

    # Detect netcat version and use appropriate syntax
    # DO NOT pass address after port - that makes nc act as client!
    if nc -h 2>&1 | grep -q "OpenBSD"; then
        # OpenBSD netcat (common on Ubuntu/Debian)
        nc -l "$port" </dev/null >/dev/null 2>&1 &
    else
        # GNU netcat (traditional)
        nc -l -p "$port" </dev/null >/dev/null 2>&1 &
    fi
    NC_PID=$!

    # Give nc a moment to bind to the port
    sleep 0.1

    # Verify the process is still alive (bind succeeded)
    # If nc failed to bind (port in use), it exits immediately
    if ! kill -0 "$NC_PID" 2>/dev/null; then
        NC_PID=""
        return 1  # Lock acquisition failed
    fi

    # Set up cleanup trap - ensures lock release on exit
    trap 'release_lock' EXIT INT TERM
    return 0  # Lock acquired successfully
}

# Wait for lock with retry logic and timeout
# Returns 0 if lock acquired, 1 on timeout
wait_for_lock() {
    local port="$1"
    local attempt=0

    while [ $attempt -lt $MAX_WAIT_SECONDS ]; do
        if acquire_lock "$port"; then
            return 0  # Lock acquired
        fi

        # Lock held by another process - wait and retry
        sleep 1
        attempt=$((attempt + 1))

        # Progress indicator every N seconds
        if [ $((attempt % PROGRESS_INTERVAL)) -eq 0 ]; then
            echo "port-lock: Waiting for lock on port $port (${attempt}s elapsed)..." >&2
        fi
    done

    echo "port-lock: ERROR: Timeout waiting for lock after ${MAX_WAIT_SECONDS}s" >&2
    echo "port-lock: Port $port may be held by stalled process or Supabase service" >&2
    return 1  # Timeout
}

# ============================================================================
# Main Execution
# ============================================================================

# Derive port from lockfile path
LOCK_PORT=$(generate_lock_port "$LOCKFILE")

# Attempt to acquire lock
if ! wait_for_lock "$LOCK_PORT"; then
    exit 1
fi

# Lock acquired - run the command
# Use "$@" directly to preserve argument boundaries and quoting
"$@"
EXIT_CODE=$?

# Lock automatically released via trap on exit
exit $EXIT_CODE
