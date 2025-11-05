# Notes Directory Layout

**Notes directory:** !`./.claude/skills/_shared/notes/echo-notes-dir.sh`

## Folder Structure

```
./.notes/
├── [topic]/              # Topic-based folders (e.g., pgflow-demo, ci-optimization)
│   ├── WIP-*.md         # Work in progress (quick captures, drafts)
│   └── *.md             # Refined notes (ready to use)
│
├── _archive/            # Archived/completed work
│   └── [topic]/         # Organized by original topic
│
├── _reference/          # Knowledge base (optional)
│   └── *.md             # Reference docs, guides, non-actionable info
│
└── roadmap.md           # (optional) Project roadmap
```

## File Naming

- **WIP prefix**: `WIP-descriptive-name.md` for work in progress
- **No prefix**: `descriptive-name.md` for refined notes
- **Kebab-case**: Use hyphens, lowercase, no spaces
- **Extension**: Always `.md`

## Workflow

1. **Capture**: Create `[topic]/WIP-note.md` (note-capture skill)
2. **Refine**: Edit and improve over time (note-refine skill)
3. **Finalize**: Remove WIP prefix when ready (note-organize skill)
4. **Archive**: Move to `_archive/[topic]/` when done (note-organize skill)

## Important Notes

- Always use `./.notes/` (relative to repo root)
- Working directory (`$PWD`) must be repository root
- Use relative paths for scripts: `./.claude/skills/_shared/notes/`
- Topics are inferred from folder names (use `list-topics.sh` script)
