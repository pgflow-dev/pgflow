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

**If pattern provided (e.g., "all get-started docs"):**
- Use glob to find matching files
- Present list to user in a/b/c format or "all"
- WAIT for confirmation

### Step 2: Run Automated Style Checks

For each target file, check for these violations:

#### 1. Character Issues (CRITICAL)
```typescript
// Check for and fix:
violations = {
  emDash: /—/g,          // Replace with: -
  curlyQuoteLeft: /[""]/g, // Replace with: "
  curlyQuoteRight: /[""]/g, // Replace with: "
  curlyApostrophe: /'/g, // Replace with: '
  ellipsis: /…/g,        // Replace with: ...
  nbspSpace: /\u00A0/g,  // Replace with regular space
}
```

#### 2. Naming Convention Violations
```typescript
// Check for and fix:
- PgFlow → pgflow
- pgFlow → pgflow
- PGFlow → pgflow
- Pgflow in prose → pgflow
// Exception: Keep "Pgflow" in class names (PascalCase)
```

#### 3. Link Format Issues
```typescript
// Check for and fix:
- Internal links without trailing slash: /path → /path/
- Relative links: ../path → /absolute/path/
```

#### 4. Common Voice Violations
```typescript
// Check for and flag (don't auto-fix, requires context):
- "we provide", "we use", "our system"
- "let's create", "let's start"
- "We'll be", "We're going to"
```

### Step 3: Apply Automatic Fixes

Apply fixes for categories 1-3 automatically (character, naming, links).

For category 4 (voice), only FLAG for user review - don't auto-fix.

### Step 4: Present Results

Show summary:
```markdown
## Style Fixes Applied: [filename(s)]

**Character fixes:** [count]
- Em-dashes: [count]
- Curly quotes: [count]
- Ellipsis: [count]

**Naming fixes:** [count]
- PgFlow/pgFlow → pgflow: [count]

**Link fixes:** [count]
- Added trailing slashes: [count]

**Voice issues flagged (manual review needed):**
[If any found, list them with line numbers]

[If no issues] ✓ No style violations found!
```

### Step 5: Run Character Replacement Script

After applying fixes with Edit tool, also run the official script to catch anything missed:
```bash
./scripts/replace-special-chars.sh [file]
```

Show script output.

### Step 6: Verify Changes

Quickly read the fixed file to confirm:
- No broken markdown syntax
- No broken code blocks
- Links still valid format
- Changes look correct

If everything looks good, confirm completion.

## Automated Fix Patterns

### Pattern 1: Character Fixes
```markdown
# Before
Don't use curly quotes—they break things… it's problematic.

# After
Don't use curly quotes-they break things... it's problematic.
```

### Pattern 2: Naming Fixes
```markdown
# Before
PgFlow is a PostgreSQL workflow engine. Install pgFlow using:

# After
pgflow is a PostgreSQL workflow engine. Install pgflow using:
```

### Pattern 3: Link Fixes
```markdown
# Before
See [configuration](/reference/configuration) for details.

# After
See [configuration](/reference/configuration/) for details.
```

### Pattern 4: Voice Issues (flagged only)
```markdown
# Flagged for manual review (line 42):
"Let's create our first flow"

# Suggested change:
"Create your first flow"
```

## Batch Processing

If multiple files selected, process each one and present aggregate summary:
```markdown
## Batch Style Fixes Complete

**Files processed:** [count]

**Total fixes:**
- Character issues: [count]
- Naming violations: [count]
- Link format: [count]

**Files with voice issues needing review:**
- [filename1] ([count] issues)
- [filename2] ([count] issues)

[Detailed breakdown per file if helpful]
```

## Important Reminders

- **Character fixes are SAFE** - always apply automatically
- **Naming fixes are SAFE** - always apply (except in PascalCase class names)
- **Link fixes are SAFE** - trailing slashes don't break anything
- **Voice fixes need CONTEXT** - flag only, don't auto-change
- **Test after fixing** - make sure markdown still renders
- **Use official script** - run `replace-special-chars.sh` as final step

## Special Cases

**If file has significant voice issues:**
- Suggest using `/edit-doc` for comprehensive cleanup
- This command focuses on mechanical fixes

**If file is very large (>500 lines):**
- Warn user about many fixes
- Ask confirmation before proceeding

**If file has complex violations:**
- Fix what's mechanical
- Flag complex issues for manual review

## Output

Use Edit tool to apply all automatic fixes.

Run `./scripts/replace-special-chars.sh` to catch any remaining issues.

Present summary of all fixes applied and any issues flagged for review.
