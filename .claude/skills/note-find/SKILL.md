---
name: note-find
description: Search for notes across topics or within specific topic. Use when user says "find note [about X]", "search notes [for X]", "do we have [a] note [on X]", "find notes related to X", "search [topic] for X", "[there's a] note about X". IMPORTANT - User must say "note" or "notes" explicitly.
allowed-tools: Read, Bash, Grep, AskUserQuestion
---

# Note Find

Search for notes by keyword or phrase.

<critical>
- ALWAYS use AskUserQuestion if multiple matches found
- User MUST say "note" or "notes" (not just "find X")
- Ask before reading full content (could be large)
</critical>

## Workflow

**1. Parse search:**
- Topic specified? Search within `.notes/[topic]/`
- No topic? Search all topics (exclude `_archive/`, `_reference/`)

**2. Search:**
```bash
# Use existing search script
./.claude/skills/_shared/notes/search-notes.sh "[pattern]" [topic/]

# Or for title-only search
./.claude/skills/_shared/notes/list-titles.sh [topic/] | grep -i "[pattern]"

# Add AI summaries to help identify the right note (when results are unclear)
./.claude/skills/_shared/notes/search-notes.sh "[pattern]" | ./.claude/skills/_shared/notes/summarize-notes.sh
```

<tip>
Pipe search results to summarize-notes.sh when:
- Multiple results and titles don't clearly distinguish them
- User can't identify which note they want
- Need quick context to disambiguate similar notes
</tip>

**3. Present results:**

- **0 matches:** "No notes found for '[query]'"
- **1 match:** Show title + path, ask if user wants to read it
- **2-4 matches:** Use AskUserQuestion to select which to read
- **5+ matches:** List titles, ask user to refine search

<critical>
ALWAYS use AskUserQuestion before reading full content
</critical>

## Examples

**Specific topic:**
- "find note about deployment in pgflow-demo"
- "search ci-optimization for parallel jobs"

**All topics:**
- "find note about advisory locks"
- "do we have a note on rate limiting"
- "search notes for deployment strategies"

## Selection Pattern

Use AskUserQuestion for multiple matches:

```
question: "Found 3 notes matching '[query]'. Which to read?"
options:
  - label: "pgflow-demo/WIP-deployment.md"
    description: "Demo deployment plan"
  - label: "ci-optimization/deployment-strategy.md"
    description: "CI deployment strategy"
multiSelect: false
```

@../_shared/notes/notes-layout.md
