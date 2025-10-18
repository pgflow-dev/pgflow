---
allowed-tools: Read, Grep, Bash(ls:*), Bash(tree:*), Bash(wc -l:*)
description: Audit documentation files for compliance with pgflow guidelines and Diataxis
argument-hint: <file-path>
---

You are tasked with auditing documentation for compliance with pgflow guidelines, Diataxis framework, and identifying quality issues.

## Context

Documentation root: `pkgs/website/src/content/docs/`

User request:
<request>
$ARGUMENTS
</request>

## Multi-Step Process

### Step 1: Validate Target

**Target must be a single .mdx file path.**

If no argument or directory provided:
- Search for matching files using Grep/tree
- Present options to user
- WAIT for confirmation

If path provided, verify file exists:
```bash
ls -la pkgs/website/src/content/docs/[file-path]
```

Present target:
```markdown
## Audit Target

**File:** pkgs/website/src/content/docs/[path]
**Lines:** [count]
```

WAIT for user confirmation.

### Step 2: Read Guide Files

Read all guide files to understand standards:

```bash
# Read guides in parallel
```

Files to read:
1. `NOMENCLATURE_GUIDE.md` - Terminology standards
2. `ARCHITECTURE_GUIDE.md` - Architecture concepts
3. `DOCS_GUIDE.md` - Documentation standards
4. `.claude/core/character_guidelines.md` - Character rules
5. `.claude/core/diataxis.md` - Content type definitions
6. `.claude/core/naming_convention.md` - Naming rules

### Step 3: Read Target File

Read the target documentation file completely.

### Step 4: Analyze Against Standards

**BE PRAGMATIC**: Only flag issues that significantly impact readers or correctness. Don't be nitpicky about things that mostly work.

**Critical Issues - Must fix:**
- Broken links (internal/external)
- Wrong/broken code examples
- Incorrect architecture/terminology
- Character violations (curly quotes, em-dashes, etc.)
- Incorrect naming (pgFlow, PgFlow, etc.)

**Important Issues - Should fix:**
- Missing trailing slashes on internal links
- Missing or incorrect frontmatter
- Wrong H1 usage (multiple H1s in content)
- Significantly unclear explanations

**Only if valuable to readers:**
- Suggest Diataxis improvements ONLY if doc is clearly misclassified
- Suggest reorganization ONLY if current structure causes confusion
- Suggest cross-references ONLY if missing links hurt understanding

**DO NOT flag:**
- Minor style inconsistencies
- Content type mixing if it serves users (brief install in how-to is fine)
- Small docs (<400 lines)
- Missing "What You'll Learn" sections
- Platform notes when only one platform exists

### Step 5: Generate Report

Create a structured report with specific examples:

```markdown
# Audit Report: [filename]

**Location:** pkgs/website/src/content/docs/[path]
**Type:** [Tutorial/How-to/Explanation/Reference]
**Lines:** [count]

## Critical Issues

[If none: "None found"]
[If found: List with line numbers and examples]

1. [Issue] (line [X])
   - Found: `[actual text]`
   - Fix: `[suggested text]`

2. [Issue] (lines [X-Y])
   - Problem: [description]
   - Suggestion: [fix]

## Important Issues

[Similar format]

## Suggestions

[Only significant improvements that add real value]

## Summary

**Assessment:** [Excellent/Good/Needs Work/Major Issues]
**Critical:** [count] | **Important:** [count] | **Suggestions:** [count]
**Estimated fix time:** [5min/15min/30min/1hr]

**Next steps:**
1. [Most important fix]
2. [Second priority]
3. [Third priority if any]
```

### Step 6: Present Findings

Show the report to the user with actionable next steps:

```markdown
## Audit Complete

[Show the report]

**Next steps:**
- Fix critical issues first
- You can say "fix issue 1 and 3" to address specific items
- Run `/audit-doc [file]` again after fixes to verify
```

## Common Issues Reference

**Critical (always fix):**
- `pgFlow`/`PgFlow` → `pgflow`
- `/path/to/doc` → `/path/to/doc/` (trailing slash)
- Curly quotes "" → Straight quotes ""
- Em-dash — → Hyphen -
- Broken code examples

**Important (fix if found):**
- Multiple H1s → Only one H1 in frontmatter title
- Missing `draft: false` in frontmatter
- Code blocks without language
- Relative links `../other` → Absolute `/other/`

**Suggestions (only if valuable):**
- Missing cross-references that would help understanding
- Structure issues causing real confusion
- Diataxis misclassification (e.g., tutorial written as reference)

## Error Handling

- **File not found:** Ask user to verify path
- **Not .mdx file:** Only audit .mdx files
- **Too large (>1000 lines):** Warn and suggest splitting first

## Special Cases

- **index.mdx:** Check for proper overview structure
- **Tutorial:** Verify step-by-step progression
- **Reference:** Check completeness and accuracy
- **How-to:** Verify problem-solving focus
