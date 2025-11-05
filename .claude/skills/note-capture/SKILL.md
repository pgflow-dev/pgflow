---
name: note-capture
description: Save conversation context to topic notes. Use when user says "capture note [about X]", "save to notes", "create note [in topic]", "note this [for topic]", "add note to [topic]". IMPORTANT - User must say "note" or "notes" explicitly.
allowed-tools: Write, Bash, AskUserQuestion
---

# Note Capture

Save conversation context to `.notes/[topic]/WIP-[name].md`

@../_shared/notes/topics.md

<critical>
- ALWAYS use AskUserQuestion for topic selection
- User MUST say "note" or "notes" (not just "save this")
</critical>

## Workflow

**1. Determine topic:**

If user specified topic explicitly → use it

Otherwise use AskUserQuestion to select from available topics above.

**2. Create file:**
- Filename: `WIP-[descriptive-name].md` (kebab-case)
- Location: `.notes/[topic]/WIP-[name].md`
- Format: H1 title on first line

**3. Confirm:**
- Tell user where saved
- Suggest `notes-sync` skill to commit

## File Format

```markdown
# [Descriptive title]

[Content from conversation]
```

H1 can be informal: questions, TODOs, context notes.

## Examples

**With explicit topic:**
- "capture note about deployment in pgflow-demo"
- "add note to ci-optimization about parallel jobs"

**Inferred topic:**
- "capture note about this CI discussion" → Ask: which topic?
- "note this for later" → Ask: which topic + what to capture?

@../_shared/notes/notes-layout.md
