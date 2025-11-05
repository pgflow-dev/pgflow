---
name: note-overview
description: Summarize all notes in a topic. Use when user says "overview of [topic]", "summarize [topic] [notes]", "catch up on [topic]", "what's in [topic]", "recent [topic] work", "remind me about [topic]".
allowed-tools: Read, Bash, AskUserQuestion
---

# Note Overview

Provide summary of all notes in a topic.

@../_shared/notes/topics.md

<critical>
- ALWAYS ask before reading all notes (could be many files)
- Use AskUserQuestion to confirm topic if ambiguous
</critical>

## Workflow

**1. Determine topic:**

If user specified → use it

Otherwise use AskUserQuestion to select from available topics above.

**2. Check note count:**
```bash
# Count notes in topic
count=$(find .notes/[topic] -maxdepth 1 -name "*.md" | wc -l)
```

<tip>
For quick overviews without reading full content, use summarize-notes.sh:
```bash
./.claude/skills/_shared/notes/list-titles.sh [topic]/ | ./.claude/skills/_shared/notes/summarize-notes.sh
```
This provides AI-generated summaries without reading full files.
Use when user wants a fast overview or you want to avoid reading many large files.
</tip>

**3. Ask confirmation:**

Use AskUserQuestion if >5 notes:
```
question: "Found [count] notes in [topic]. Read all for summary?"
options:
  - label: "Yes, summarize all"
  - label: "No, just list titles"
```

**4. Summarize:**
- Group by WIP vs refined (WIP prefix)
- Highlight recent activity
- Show key themes/topics
- Identify related notes

## Output Format

```
Overview of ci-optimization (7 notes):

Work in Progress (3):
- WIP-parallel-jobs.md: Exploring parallel CI job strategies
- WIP-cache-optimization.md: Quick notes on cache improvements
- WIP-matrix-testing.md: PostgreSQL version matrix ideas

Refined Plans (4):
- nx-build-plan.md: Complete Nx build optimization strategy
- test-restructure.md: Restructure tests by toolchain
- deployment-strategy.md: CI deployment approach
- version-matrix.md: Version matrix configuration

Key themes: CI performance, test organization, caching
```

## Examples

- "overview of pgflow-demo" → Summarize all demo-related notes
- "catch up on ci-optimization" → Show what's in that topic
- "what's happening with content-marketing" → Overview of notes

@../_shared/notes/notes-layout.md
