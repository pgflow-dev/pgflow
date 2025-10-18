You are tasked with auditing documentation for compliance with pgflow guidelines, Diataxis framework, and identifying quality issues.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target for audit:
<target>
$ARGUMENTS
</target>

## Process

### Step 1: Validate Target

**Target must be a single .mdx file path.**

If no argument or directory provided:
- Ask user to specify a single file path
- Example: `/audit-doc guides/getting-started.mdx`

Present target file and **WAIT for confirmation.**

### Step 2: Determine Audit Mode

Ask user which audit mode:
- **Quick**: Diataxis + critical style issues only
- **Standard**: All categories, standard depth (default)
- **Deep**: Comprehensive review with detailed analysis

### Step 3: Perform Audit with Task Agent

**Launch a single general-purpose task agent to audit the file.**

Present the task summary to the user before launching:

```markdown
## Task Agent Instructions

I'm launching a task agent to audit the documentation with these instructions:

**Context:**
- Target file: [filepath]
- Audit mode: [Quick/Standard/Deep]

**Agent will:**
1. Read NOMENCLATURE_GUIDE.md for terminology standards
2. Read ARCHITECTURE_GUIDE.md for architectural accuracy
3. Read DOCS_GUIDE.md for compliance criteria, patterns, and examples
4. Read .claude/character_guidelines.md for character rules
5. Read .claude/diataxis.md for content type definitions
6. Read .claude/naming_convention.md for naming rules
7. Audit the file against all standards
8. Generate structured report with specific examples and priorities

**Audit categories to check (BE PRAGMATIC, NOT PEDANTIC):**
1. **Critical Issues Only** - Broken links, wrong code, incorrect architecture/terminology, character violations
2. **Style Compliance** - pgflow naming (not pgFlow/PgFlow), voice consistency, trailing slashes
3. **Structural Issues** - Missing frontmatter, H1 usage, broken code examples
4. **Content Quality** - Technical accuracy, missing important info, unclear explanations

**IMPORTANT - DO NOT flag these as issues:**
- Missing contentType in frontmatter (we don't use it)
- Mixing installation/setup with how-to content (pragmatic for small sections)
- Missing "What You'll Learn" sections (only needed for long/complex docs)
- Platform-specific notes when only one platform exists (Supabase is the only platform currently)
- Small docs that don't need splitting (<400 lines is fine)

**BE PRAGMATIC:**
- Content type mixing is OK if it serves the user (brief install section in how-to is fine)
- Suggest reorganization ONLY if specific, actionable, and clearly better
- Don't invent requirements not in the guides

**Report format:**

```markdown
# Audit Report: [filename]
**Location:** [path]
**Type:** [Tutorial/How-to/Explanation/Reference]
**Length:** [count] lines

## Tier A: CRITICAL ISSUES
[Diataxis violations, broken links, incorrect code, terminology violations, architectural inaccuracies]

A1. [Issue description with line numbers and specific examples]
A2. [Issue description with line numbers and specific examples]
...

## Tier B: IMPORTANT ISSUES
[Style violations, structural problems, naming inconsistencies]

B1. [Issue description with line numbers and specific examples]
B2. [Issue description with line numbers and specific examples]
...

## Tier C: IMPROVEMENTS
[Content quality, cross-references, clarity enhancements]

C1. [Issue description with line numbers and specific examples]
C2. [Issue description with line numbers and specific examples]
...

## SUMMARY
**Assessment:** [Excellent/Good/Needs Work/Major Issues]
**Priority Actions:** [Top 3 fixes using tier notation, e.g., "A1, A3, B2"]
**Estimated Effort:** [Small/Medium/Large]
```

**Instructions for agent:**
- Number each issue within its tier (A1, A2, A3... B1, B2, B3... C1, C2, C3...)
- Provide line numbers and specific examples for each issue
- Be constructive with suggested fixes
- Prioritize critical issues first
- Suggest next commands to run using tier notation (e.g., "fix A1,2,3 and B1")
```

**Launching agent...**

Use the Task tool with subagent_type "general-purpose" and provide:
- Target file path and audit mode
- Instructions to read all guide files (NOMENCLATURE_GUIDE.md, ARCHITECTURE_GUIDE.md, DOCS_GUIDE.md, .claude/character_guidelines.md, .claude/diataxis.md, .claude/naming_convention.md)
- Report format specified above
- Instructions to provide specific examples and line numbers

## Output Format

After the task agent completes, present results to the user:

```markdown
## Audit Complete: [filename]

**Tier A (Critical) issues:** [count]
**Tier B (Important) issues:** [count]
**Tier C (Improvements):** [count]
**Overall assessment:** [summary]

**Next steps:**
- Review the detailed report above
- You can now reference issues by tier notation (e.g., "fix A1,2,3 and B2")
- Fix Tier A issues first, then B, then C
- Consider splitting if document is >300 lines
```
