# Notes Directory Layout

**Notes directory:** !`./.claude/skills/notes/scripts/echo-notes-dir.sh`

## Folder Structure

```
./.notes/
├── scratch/         # Quick captures from conversations
│                    # Managed by scratch-capture skill
│                    # Reviewed by scratch-review skill
│
├── brewing/         # Ideas being explored, worth consideration
│                    # Promoted from scratch after review
│
├── features/        # Implementation-ready specs
│                    # Flat structure, one file per feature
│
├── roadmap.md       # Sequenced list with dependencies
│
└── archive/         # Completed work
```

## Important Notes

- Always use `./.notes/` (relative to repo root)
- Working directory (`$PWD`) must be repository root
- Use relative paths for scripts: `./.claude/skills/notes/scripts/`
