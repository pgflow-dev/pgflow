---
name: Idea Refinement
description: Iteratively refine ideas in brewing/ or features/ by exploring implementation approaches, cross-referencing codebase patterns, evaluating trade-offs, and discussing architectural choices. Use when user says "work on X", "refine this idea", "explore options for X", "how does X affect Y", "check if this conflicts with", "add implementation details", "what are the options for X", "let's think through X approach".
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Idea Refinement

**Notes directory:** !`./.claude/skills/notes/scripts/echo-notes-dir.sh`

**Context:** @../notes/shared/directory.md @../notes/shared/conventions.md

Iteratively refine brewing ideas through exploration and codebase cross-referencing until architectural decisions are made. Then add implementation details to features.

## Workflow

**1. Read the idea:**
```bash
cat ./.notes/brewing/idea-name.md
# or
cat ./.notes/features/feature-name.md
```

**2. Search related work when needed:**

Search notes:
```bash
./.claude/skills/notes/scripts/search "pattern" brewing/
./.claude/skills/notes/scripts/search "pattern" features/
./.claude/skills/notes/scripts/list-titles brewing/ features/
```

Search codebase:
```bash
# Use Grep tool to find patterns in pkgs/
# Example: Find PGMQ schema, worker patterns, similar implementations
```

**3. Discuss with user:**
- Explore options and trade-offs
- Cross-reference with existing code
- Identify conflicts or dependencies
- Evaluate approaches

**4. Edit the file:**
```bash
# Use Edit tool to update the brewing/features file
# Add findings, options, decisions, cross-references
```

**5. Repeat until done**

## Brewing vs Features

**Brewing** - Exploring architectural choices:
- Multiple approaches viable
- Trade-offs not yet evaluated
- Key decisions unmade
- **When ready:** All major architectural choices decided → suggest moving to features/

**Features** - Architecture decided, specifying implementation:
- The "what" is clear, defining the "how"
- Specific file paths, function names, column names
- Step-by-step implementation plan
- **When ready:** Hand to agent for implementation

## Example Triggers

- "Let's work on the fair processing idea"
- "Refine the context system plan"
- "Explore options for the helper queue approach"
- "How does this affect existing PGMQ code?"
- "Check if this conflicts with the step output feature"
- "Add implementation details for the output column"
- "What are the trade-offs for approach A vs B?"
- "Find similar patterns in the codebase"

## Important

- **Never commit** - Use notes-sync skill for git operations
- **Iterative** - Multiple rounds of read → search → discuss → edit
- **Cross-reference freely** - Check brewing, features, and codebase
- **Keep it conversational** - No rigid format required
