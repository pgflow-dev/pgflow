# File Conventions

## H1 Requirement

Every file MUST have H1 on the first line:

- **Scratch:** `# Any descriptive title` (informal, can be questions/TODOs)
- **Brewing:** `# IDEA: Feature Name` (must have IDEA: prefix)
- **Features:** `# Feature Name` (no prefix, clear name)

## Feature File Structure

Required sections:
- Objective (what problem it solves)
- Prerequisites / Dependencies
- Implementation Steps
- Acceptance Criteria
- Cross-References (related features, replaced ideas)

## Roadmap Format

Numbered list with explicit links for GitHub browsing:

```markdown
1. [Feature Name](features/feature-name.md)
   - Blocks: X, Y
   - Unblocks: Z
   - Why this order: rationale
```

## File Naming

- Use kebab-case: `async-task-execution.md`
- Be descriptive, avoid abbreviations
- Extension: `.md`
