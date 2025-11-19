#!/bin/bash
set -e

# Check current branch
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ]; then
  echo "ERROR: Direct pushes from main branch are not allowed!"
  exit 1
fi

# Check destination branch (handles: git push origin feature:main)
# Git hook receives: <local_ref> <local_sha> <remote_ref> <remote_sha> per line
# Only read if stdin is available (not a tty)
if [ ! -t 0 ]; then
  while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
    # Skip empty lines
    [ -z "$remote_ref" ] && continue

    # Extract branch name from ref
    remote_branch="${remote_ref#refs/heads/}"

    if [ "$remote_branch" = "main" ]; then
      echo "ERROR: Pushing to remote main branch is not allowed!"
      echo "Attempted: $local_ref -> $remote_ref"
      exit 1
    fi
  done
fi

exit 0
