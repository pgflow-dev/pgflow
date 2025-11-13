# Multi-File Conflict Resolution

Multiple files are conflicted. Resolve non-lockfiles first, then regenerate lockfile.

## Conflicted Files

!`git --no-pager -c color.ui=false diff --name-only --diff-filter=U --no-renames`

## Resolution Strategy

For each non-lockfile conflict:

### 1. Show the conflict

```bash
git --no-pager -c color.ui=false diff <file>
```

### 2. Explain conflict

Extract from diff:
- What changed in base (HEAD)
- What changed in branch (incoming)
- Why it conflicts

### 3. Ask resolution via AskUserQuestion

```
question: "How to resolve <file>?"
header: "Resolution"
options:
  - label: "--theirs (main's version)"
    description: "Accept base branch - good for style/formatting consistency"
  - label: "--ours (branch's version)"
    description: "Keep your branch changes - good for features/dependencies"
  - label: "Manual edit"
    description: "I'll resolve manually, continue after I'm done"
  - label: "Show context"
    description: "Show git show HEAD:<file> to inspect"
```

### 4. Execute choice

```bash
# --theirs
git checkout --theirs <file>

# --ours
git checkout --ours <file>

# Manual: Wait for user confirmation
```

## After All Non-Lockfiles Resolved

Regenerate lockfile and continue:

```bash
pnpm install && gt add -A && gt continue
```

## Check Result

After `gt continue`:
- **Another conflict** → Loop back (return to SKILL.md routing)
- **Success** → Proceed to success message in SKILL.md

## Resolution Guidelines

**Use `--theirs` (main's version) for:**
- Style/formatting conflicts (e.g., quoted vs unquoted YAML)
- Configuration files where consistency with main matters
- Files you didn't intentionally change

**Use `--ours` (branch's version) for:**
- Your branch added dependencies (e.g., pnpm-workspace.yaml)
- Feature changes you need to preserve
- Files where your changes are the whole point

**Rule of thumb:** When in doubt, choose consistency with main (`--theirs`).
