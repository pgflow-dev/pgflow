---
name: Scratch Review
description: Review and triage scratch notes by age. Delete outdated notes, keep active ones, promote valuable ideas to brewing. Use when user says "review scratch", "check scratch", "clean up scratch", "triage notes", "remove that old note about X", "scrap that note", or asks to check old scratch items.
allowed-tools: Read, Bash, Grep, Glob
---

# Scratch Review

**Notes directory:** !`./.claude/skills/notes/scripts/echo-notes-dir.sh`

**Context:** @../notes/shared/directory.md @../notes/shared/conventions.md

## Workflow

**1. List files (sorted oldest modification first):**
```bash
./.claude/skills/notes/scripts/list-titles --with-dates scratch/
```
Output format:
```
# PATH | TITLE | MODIFIED | CREATED
scratch/old-idea.md | Database Patterns | 3mo ago | 6mo ago
scratch/recent.md   | Async Ideas       | 2d ago  | 1w ago
```

**Filtering:**
- Subdirectory: `list-titles --with-dates scratch/subdir/`
- By content: `./.claude/skills/notes/scripts/search "pattern" scratch/`
- When user says "remove note about X": search first, then review matches

**2. Review each file (start with oldest):**
- Read: `cat ./.notes/scratch/filename.md`
- Check dates: Old modification = likely abandoned, recent = still active
- Ask user: Keep / Delete / Promote / Skip

**3. Execute actions:**
- **Delete:** `rm ./.notes/scratch/filename.md` (git preserves history)
- **Promote:** `mv ./.notes/scratch/file.md ./.notes/brewing/file.md` then edit H1 to add `IDEA:` prefix

**Important:** Never commit - `notes-sync` skill handles git operations.

## Modes

**Default:** "review scratch" → List all files, focus on oldest first
**Filtered:** "remove note about X" → Search for matches, review those only
**Advanced:** On request, cross-reference with brewing/features or search codebase

## Decision Guide

**Keep:** Recently modified (active work), quick reference, useful context
**Delete:** Abandoned (old mod date), outdated, already implemented, no longer relevant
**Promote:** Worth exploring further, has value, could become feature (requires `IDEA:` H1 prefix)
