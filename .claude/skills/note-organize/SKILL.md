---
name: note-organize
description: Archive notes, remove WIP prefix, or clean up topics. Use when user says "organize [topic] [notes]", "clean up [topic]", "archive note [about X]", "review old [topic] notes", "triage [topic]", "this note is done/refined".
allowed-tools: Read, Bash, Edit, AskUserQuestion
---

# Note Organize

Archive completed notes, refine WIP notes, clean up topics.

@../_shared/notes/topics.md

<critical>
- ALWAYS use AskUserQuestion for all decisions
- Never modify/move files without user confirmation
</critical>

## Workflow

**1. Determine scope:**

- User specified topic? Work within that topic
- User specified note? Find and act on that note
- Otherwise: Ask which topic to organize from available topics above

**2. List notes with dates:**
```bash
./.claude/skills/_shared/notes/list-titles.sh --with-dates [topic]/
```

**3. Review each (oldest first):**

For each note, use AskUserQuestion:
```
question: "What to do with '[note-title]'?"
options:
  - label: "Refine (remove WIP prefix)"
    description: "This note is ready, remove WIP-"
  - label: "Archive"
    description: "Move to _archive/[topic]/"
  - label: "Keep as-is"
    description: "Leave unchanged"
  - label: "Skip remaining"
    description: "Stop organizing"
multiSelect: false
```

**4. Execute actions:**

- **Refine:** `mv .notes/topic/WIP-note.md .notes/topic/note.md`
- **Archive:** `mv .notes/topic/note.md .notes/_archive/topic/note.md`
- **Keep:** No action

## Examples

- "organize pgflow-demo notes" → Review all notes in topic
- "clean up ci-optimization" → Triage old/new notes
- "archive note about EQTR negotiation" → Find and archive specific note
- "this deployment note is refined now" → Remove WIP prefix
- "triage old notes" → Ask which topic, then organize

## Important

Never commit changes - suggest `notes-sync` skill after organizing.

@../_shared/notes/notes-layout.md
