---
name: note-refine
description: Edit and improve existing notes iteratively. Use when user says "work on [note/topic]", "refine this [note/idea]", "add details to X", "explore options for X", "let's think through X".
allowed-tools: Read, Edit, Bash, Grep, Glob, AskUserQuestion
---

# Note Refine

Iteratively edit and improve notes through discussion and codebase exploration.

@../_shared/notes/topics.md

<critical>
- ALWAYS use AskUserQuestion to select note if ambiguous
- Ask before reading large notes
- Iterative: read → discuss → edit → repeat
</critical>

## Workflow

**1. Find note:**

If user specified → find it (use note-find logic)

Otherwise ask which topic from available topics above, then which note in topic.

**2. Read current content:**

Use Read tool on `.notes/[topic]/[note].md`

**3. Discuss & explore:**

- Understand user's refinement goals
- Search related notes if needed
- Search codebase for patterns/examples
- Evaluate trade-offs and options

**4. Edit note:**

Use Edit tool to update the note with:
- New findings
- Explored options
- Architectural decisions
- Implementation details
- Cross-references to code/other notes

**5. Repeat until done**

Multiple rounds: read → discuss → edit

## Supporting Operations

**Search related notes:**
```bash
./.claude/skills/_shared/notes/search-notes.sh "[pattern]" [topic]/
./.claude/skills/_shared/notes/list-titles.sh [topic]/
```

**Search codebase:**

Use Grep tool to find patterns in pkgs/

## Note Selection Pattern

Use AskUserQuestion if multiple notes found:

```
question: "Which note to refine?"
options:
  - label: "WIP-deployment.md"
    description: "Deployment strategy (work in progress)"
  - label: "cloud-setup.md"
    description: "Cloud deployment setup plan"
multiSelect: false
```

## Examples

- "work on the pgflow-demo deployment note"
- "refine the CI optimization idea"
- "add details to the parallel jobs plan"
- "explore options for test restructuring"
- "let's think through the caching approach"

## Important

- Keep conversational - no rigid format required
- Cross-reference freely between notes and codebase
- Never commit - suggest `notes-sync` after refining

@../_shared/notes/notes-layout.md
