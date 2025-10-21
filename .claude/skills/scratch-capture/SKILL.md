---
name: scratch-capture
description: Save conversation context, ideas, or notes to scratch folder for later review. Use when user says "save this", "remember this", "capture this note", "add to scratch", "memorize this for later", "take a note".
allowed-tools: Write, Bash
---

# Scratch Capture

Quickly save conversation context or ideas to the scratch folder for later review.

## Workflow

1. Identify content to capture from conversation
2. Generate descriptive filename (kebab-case)
3. Create H1 title on first line
4. Write to `./.notes/scratch/filename.md`
5. Tell user where it was saved
6. Suggest using notes-sync skill to commit

## File Format

Every scratch file must have H1 on first line:

```markdown
# Quick thought about X
# Context: Database patterns discussion
# TODO: Investigate async workflows
```

Format is informal - can be questions, TODOs, or descriptive titles.

## File Naming

- Use kebab-case: `database-patterns.md`
- Be descriptive but concise
- Extension: `.md`
- No spaces, underscores, or special characters

## Example

User says: "Remember we discussed using advisory locks for task queues"

Creates: `./.notes/scratch/advisory-locks-task-queues.md`

```markdown
# Advisory locks for task queues

Context from conversation about using Postgres advisory locks
instead of row-level locks for task queue implementation.

Key points:
- Better performance for high-concurrency scenarios
- Automatic cleanup on connection loss
- Need to research timeout handling
```

## Notes Directory

@../notes/shared/directory.md
