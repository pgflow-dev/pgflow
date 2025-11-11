# Restack

Use when user asks to "restack", "resolve conflicts", "gt restack", or mentions restack conflicts. Guides through gt restack conflicts with intelligent diagnostics and resolution. (project)

<critical>
- ALWAYS check current state first (supports both: starting fresh or mid-conflict)
- If already in conflict, skip running gt restack and go straight to resolution
- Differentiate simple (lockfile-only) vs complex (multi-file) conflicts
- Loop until restack completes successfully
- Use AskUserQuestion for confirmations and choices
</critical>

## Workflow

### 1. Detect Current State

First, check if restack is already in progress:

```bash
git status
```

**Check for**:
- "rebase in progress"
- "You are currently rebasing"
- "Unmerged paths"
- "both modified:" or other conflict indicators

**Outcomes**:
- Already in conflict (user ran `gt restack` manually) → Skip to step 3 (Gather Diagnostics)
- Clean state → Proceed to step 2 (Run Restack)

### 2. Run Restack (if not already in progress)

```bash
gt restack
```

**Outcomes**:
- Success → Acknowledge and exit
- Conflicts → Proceed to step 3

### 3. Gather Diagnostics

When conflicts are detected (either from step 1 or step 2), run:

```bash
# Check which files are conflicted
git status

# Show stack structure (where conflict occurred)
gt log short

# Check for broken lockfile warning
pnpm install --dry-run 2>&1 | grep -i "broken\|duplicated\|ignoring"

# For each conflicted file, show diff
git diff <file>
```

### 3. Explain Conflict Type

**Simple conflict** (lockfile-only):
- Only `pnpm-lock.yaml` in unmerged files
- Explain: Lockfile is generated content, safe to regenerate
- Propose: `pnpm install && gt add -A && gt continue`

**Complex conflict** (multi-file):
- Multiple files in unmerged files
- Explain each file's conflict
- Guide through resolution strategy

### 4. Resolve Based on Type

#### Simple Conflict Resolution

Use AskUserQuestion:
```
question: "Only pnpm-lock.yaml is conflicted. Regenerate and continue?"
header: "Simple Resolution"
options:
  - label: "Yes, run one-liner"
    description: "pnpm install && gt add -A && gt continue"
  - label: "Let me inspect first"
    description: "Show git diff pnpm-lock.yaml before proceeding"
```

If confirmed → Execute → Check output of `gt continue`:
- Another conflict → Loop back to step 3 (Gather Diagnostics)
- Success message → Proceed to step 6 (Success & Reminder)

#### Complex Conflict Resolution

For each non-lockfile conflict:

**a) Show the conflict**:
```bash
git diff <file>
```

**b) Explain the conflict** (extract from diff):
- What changed in base (HEAD)
- What changed in branch (incoming)
- Why it conflicts

**c) Ask resolution strategy** using AskUserQuestion:
```
question: "How to resolve <file>?"
header: "Resolution"
options:
  - label: "--theirs (main's version)"
    description: "Accept base branch - good for style/formatting consistency"
  - label: "--ours (branch's version)"
    description: "Keep your branch changes - good for features/dependencies"
  - label: "Manual edit"
    description: "I'll resolve it manually, just continue after I'm done"
  - label: "Show original file"
    description: "Show git show HEAD:<file> and git show :<stage>:<file> to inspect"
```

**d) Execute choice**:
- `--theirs`: `git checkout --theirs <file>`
- `--ours`: `git checkout --ours <file>`
- Manual: Wait for user confirmation
- Show original: Display and ask again

**e) After all non-lockfile conflicts resolved**:
```bash
pnpm install && gt add -A && gt continue
```

**f) Check output of `gt continue`**:
- Another conflict → Loop back to step 3 (Gather Diagnostics)
- Success message → Proceed to step 6 (Success & Reminder)

### 5. Handle Broken Lockfile

If diagnostics show "broken lockfile" warning:

Use AskUserQuestion:
```
question: "Lockfile is corrupted. Delete and regenerate?"
header: "Broken Lockfile"
options:
  - label: "Yes, delete and regenerate"
    description: "rm pnpm-lock.yaml && pnpm install && gt add -A && gt continue"
  - label: "Try pnpm install first"
    description: "pnpm might auto-fix, try without deleting first"
```

After executing choice, check output of command:
- Another conflict → Loop back to step 3 (Gather Diagnostics)
- Success message → Proceed to step 6 (Success & Reminder)

### 6. Success & Reminder

When `gt restack` completes without conflicts:

```
Restack completed successfully!

Next step: Force push your stack
  gt stack submit --force
  # Or individual branch:
  git push --force-with-lease origin <branch-name>

Note: Always use --force-with-lease for safety
```

## Quick Reference

**Simple lockfile conflict**:
```bash
pnpm install && gt add -A && gt continue
```

**Multiple files conflicted**:
```bash
git diff <file>                    # Inspect
git checkout --ours/--theirs <file>  # Resolve
pnpm install && gt add -A && gt continue
```

**Broken lockfile**:
```bash
rm pnpm-lock.yaml
pnpm install && gt add -A && gt continue
```

**Cancel restack**:
```bash
gt abort
```

## Resolution Strategy Guide

**When to use `--theirs` (accept main's version)**:
- Style/formatting conflicts (e.g., quoted vs unquoted YAML)
- Configuration files where consistency with main matters
- Files you didn't intentionally change

**When to use `--ours` (keep branch's version)**:
- Your branch added dependencies (e.g., pnpm-workspace.yaml)
- Feature changes you need to preserve
- Files where your changes are the whole point

**Rule of thumb**: When in doubt, choose consistency with main (`--theirs`).

## Troubleshooting

**Problem**: `gt continue` fails with error
**Solution**: Check `git status` for unresolved conflicts or unstaged files

**Problem**: pnpm install shows warnings about bin files
**Solution**: Usually safe to ignore - supabase CLI has known installation quirks

**Problem**: Not sure whether to use --ours or --theirs
**Solution**: Skill will show both versions and explain - use AskUserQuestion to decide

**Problem**: Multiple files conflicted, unclear which to resolve first
**Solution**: Skill resolves non-lockfiles first, then regenerates lockfile last
