---
name: notes-sync
description: Commit and sync notes to git. Use when user says "commit notes", "save notes", "sync notes", "push notes", "persist notes", "store this", "commit these changes".
allowed-tools: Bash
---

# Notes Sync

Commits and syncs changes in the notes directory to git.

## Workflow

1. Show current git status
2. Ask user for commit message (see prefixes below)
3. Stage all changes
4. Commit with message
5. Ask: "Would you like to push to remote?"

## Commit Message Prefixes

- `Add:` - New content (scratch notes, features, specs)
- `Promote:` - Moving between folders (scratch→brewing, brewing→features)
- `Update:` - Changes to roadmap.md or existing structure
- `Refine:` - Iterative improvements to content
- `Remove:` - Deletions, cleanup
- `Archive:` - Moving completed work to archive

## Commands

```bash
# Show status
git -C ./.notes status

# Stage all changes
git -C ./.notes add -A

# Commit with message
git -C ./.notes commit -m "message"

# Push to remote
git -C ./.notes push
```

## Notes Directory

@../notes/shared/directory.md
