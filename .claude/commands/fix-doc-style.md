You are tasked with quickly fixing style violations in documentation files. This is a fast, automated cleanup command.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target file(s):
<target>
$ARGUMENTS
</target>

## Process

### Step 1: Identify Target File(s)

**If specific path provided:**
- Use that file directly

**If directory provided:**
- Find all .mdx files in that directory

**If pattern provided:**
- Use glob to find matching files
- Present list to user
- **WAIT for confirmation**

### Step 2: Apply Fixes with Task Agent

**Launch a general-purpose task agent to perform automated style fixes.**

Present the task summary to the user before launching:

```markdown
## Task Agent Instructions

I'm launching a task agent to fix style violations with these instructions:

**Context:**
- Target: [file(s)]
- Mode: Automated fixes

**Agent will:**
1. Read .claude/character_guidelines.md for character rules
2. Read .claude/naming_convention.md for naming rules
3. Read DOCS_GUIDE.md for link format requirements
4. Apply automatic fixes for:
   - Character issues (em-dash, curly quotes, ellipsis, nbsp)
   - Naming violations (PgFlow/pgFlow → pgflow)
   - Link format (add trailing slashes, fix relative paths)
5. Flag voice violations (don't auto-fix):
   - "we", "our", "let's" in technical descriptions
6. Run ./scripts/replace-special-chars.sh as final verification
7. Verify changes don't break markdown syntax

**Report format:**
```markdown
## Style Fixes Applied: [filename(s)]

**Character fixes:** [count]
**Naming fixes:** [count]
**Link fixes:** [count]

**Voice issues flagged (manual review needed):**
[List with line numbers if found]

**Verification:** ./scripts/replace-special-chars.sh [result]
```
```

**Launching agent...**

Use the Task tool with subagent_type "general-purpose" and provide:
- Target files
- Include .claude/character_guidelines.md in the agent prompt
- Include .claude/naming_convention.md in the agent prompt
- Include DOCS_GUIDE.md for link format rules
- Instructions to apply safe fixes automatically
- Instructions to flag (not fix) voice violations
- Reminder to run replace-special-chars.sh script

## Important Reminders

- **Automatic fixes are safe**: Characters, naming, links - always apply
- **Voice fixes need context**: Flag only, don't auto-change
- **Use official script**: Run replace-special-chars.sh as verification
- **For complex issues**: Suggest /edit-doc for comprehensive cleanup

## Output Format

After the task agent completes, present results to the user:

```markdown
## Style Fixes Complete: [target]

**Files processed:** [count]
**Total fixes applied:** [count]
**Voice issues flagged:** [count]

**Next steps:**
- Review voice violations flagged above
- Use /edit-doc if comprehensive cleanup needed
- Build to verify: pnpm nx build website
```
