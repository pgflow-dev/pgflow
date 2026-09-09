#!/usr/bin/env bash
# Resolves the directory for cross-invocation, cross-worktree pgflow locks.
#
# Locks must live on storage shared by every process that can touch the same
# Docker resources. /tmp is private per sandbox (box mounts it as a tmpfs
# while Docker stays shared), so a /tmp lock file is NOT coordination between
# sandboxes. The git common directory (the wrapper repository's .bare for
# worktree checkouts, .git for plain clones) is shared by every worktree of
# this repository by construction, so locks placed there coordinate separate
# invocations, separate sandboxes, and separate worktrees.
#
# Open question (tracked, not solved here): whether coordination should be
# host-global across independent clones of this repository. The fixed Compose
# project name and ports collide across clones too; a repository-scoped lock
# cannot cover that. Resolving it needs an ownership decision, not another
# lock framework.
set -euo pipefail

common_dir=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)
lock_dir="$common_dir/pgflow-locks"
mkdir -p "$lock_dir"
printf '%s\n' "$lock_dir"
