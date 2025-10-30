#!/bin/bash

# Check current branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ]; then
  echo "ERROR: Direct pushes from main branch are not allowed!"
  exit 1
fi

# Check destination branch (handles: git push origin feature:main)
# Git hook receives: <local_ref> <local_sha> <remote_ref> <remote_sha> per line
# Note: Using timeout because lefthook's script execution may keep stdin open
while read -r -t 0.5 local_ref local_sha remote_ref remote_sha || [ -n "$local_ref" ]; do
  [ -z "$remote_ref" ] && break
  remote_branch=$(echo "$remote_ref" | sed 's#^refs/heads/##')
  if [ "$remote_branch" = "main" ]; then
    echo "ERROR: Pushing to remote main branch is not allowed!"
    echo "Attempted: $local_ref -> $remote_ref"
    exit 1
  fi
done

exit 0
