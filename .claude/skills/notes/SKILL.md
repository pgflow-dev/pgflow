---
name: Roadmap
description: Manage pgflow feature roadmap and development planning. Review and promote ideas from scratch to brewing, refine into feature specs, organize and sequence roadmap. Use when user mentions features, plans, roadmap, brainstorming, promoting ideas, specs, or asks to search/organize/refine development work.
allowed-tools: Read, Bash, Grep, Glob
---

# Roadmap

Manage feature lifecycle from ideas to implementation roadmap.

## Overview

This skill helps you organize and sequence pgflow features:

- **scratch/** - Quick captures (read-only, managed by Memory skill)
- **brewing/** - Ideas being explored, vetted as worth consideration
- **features/** - Implementation-ready specs (flat, one file per feature)
- **roadmap.md** - Sequenced list with context and cross-feature constraints
- **archive/** - Completed work (strategy TBD)

## Setup

**Notes directory:** `/home/jumski/SynologyDrive/Projects/pgflow/notes-pc`

The `$notes` environment variable is automatically set to this path via `.envrc.local` (direnv) and is used in all bash commands/scripts.

## Quick Start

**Important:** Always use relative paths from the repository root since `$PWD` is already set to the repo directory.

**Search content:**

```bash
./.claude/skills/roadmap/scripts/search "pattern"              # Search all folders, excludes archive
./.claude/skills/roadmap/scripts/search "pattern" "brewing/"   # Search specific folder
./.claude/skills/roadmap/scripts/search "pattern" "archive/"   # Explicitly search archive
```

**List directory:**

```bash
./.claude/skills/roadmap/scripts/list-titles "scratch/" "brewing/" "features/"
```

All scripts use `$notes` internally to locate the notes directory. The environment variable must be set via `.envrc.local` (direnv).

## Workflows

Choose the workflow you need:

- **[Review Scratch](review-scratch.md)** - List and read captured ideas
- **[Promote to Brewing](promote-brewing.md)** - Vet ideas worth exploring
- **[Refine to Features](refine-features.md)** - Create implementation-ready specs
- **[Organize Roadmap](organize-roadmap.md)** - Sequence features, define dependencies
- **[Search & Discovery](search.md)** - Find related work, discover relationships
- **[Archive](archive.md)** - Archive strategy (TBD)

## File Conventions

**Every file needs H1 on first line:**

```markdown
# Feature Name (in features/)

# IDEA: Feature Name (in brewing/)

# Random Thought (in scratch/)
```

**Feature file structure (features/):**

- Objective
- Prerequisites / Dependencies
- Implementation steps
- Acceptance criteria
- Cross-references to other features

**Roadmap.md structure:**

- Minimal, focused on sequence
- Numbered list with explicit links: `[features/foo.md](features/foo.md)`
- Context bullets: what it blocks/unblocks, why this order
- Cross-feature constraints section

## Git Integration

**After every create/update:**

```bash
git -C "$notes" add <file>
```

**Suggest commits at milestones:**

- Feature spec completed
- Roadmap reordered
- Promotion from brewing to features
- Archive operations

**Commit format:**

```bash
git -C "$notes" commit -m "Add: feature spec for X"
git -C "$notes" commit -m "Promote: idea Y to brewing"
git -C "$notes" commit -m "Update: roadmap reordering"
git -C "$notes" commit -m "Archive: feature X complete"
```

## Key Principles

- **Read-only scratch**: Memory skill writes, Roadmap reads and promotes
- **Flat features**: No subfolders in features/, one file per feature
- **Roadmap is minimal**: Just sequence, context, and cross-feature concerns
- **Explicit links**: Use `[features/foo.md](features/foo.md)` for GitHub browsing
- **Context-Aware**: Search related work automatically when helpful
- **Proactive**: Suggest next steps, always confirm first

## Requirements

- `$notes` environment variable set
- Scripts executable: `chmod +x scripts/*`
- Git repository at `$notes`

## Scripts

**search**: Case-insensitive regex search, outputs `path | title`, excludes archive by default
**list-titles**: Lists files/dirs, outputs `path | title`

For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
