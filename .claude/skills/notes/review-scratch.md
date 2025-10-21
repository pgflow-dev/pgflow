# Review Scratch

Review captured ideas from scratch folder (read-only access).

## Purpose

Scratch contains quick captures written by the Memory skill. This workflow helps you:
- List what ideas have been captured
- Read specific items to understand them
- Decide which are worth promoting to brewing

## Steps

### 1. List scratch items

```bash
./.claude/skills/roadmap/scripts/list-titles "scratch/"
```

### 2. Search for specific topics

```bash
./.claude/skills/roadmap/scripts/search "subflow" "scratch/"
```

### 3. Read promising items

Use the Read tool to examine files that look interesting.

### 4. Decide next action

For each item:
- **Promote to brewing**: Idea is worth exploring → See [Promote to Brewing](promote-brewing.md)
- **Leave in scratch**: Not ready yet, keep for later
- **Delete**: Not worth pursuing (rare, usually just leave it)

## Key Principles

- **Read-only**: Don't write to scratch/ (that's Memory skill's job)
- **Quick review**: Don't overthink, just scan and decide
- **Promotion is curation**: Only move to brewing if worth serious consideration
- **No pressure**: Ideas can live in scratch/ indefinitely

## Git Integration

No git operations needed when just reviewing. Git operations happen when promoting (see next workflow).
