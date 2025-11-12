---
name: restack
description: Use when user asks to "restack", "resolve conflicts", "gt restack", or mentions restack conflicts. Guides through gt restack conflicts with intelligent diagnostics and resolution.
allowed-tools: Bash(gt restack:*), Bash(gt continue:*), Bash(git show:*), Bash(git diff:*), Bash(git log:*), Bash(git ls-tree:*), Bash(pnpm install:*), Bash(git status:*), Bash(gt log:*), Bash(rm pnpm-lock.yaml), Bash(gt add -A:*), Bash(git checkout --theirs:*), Bash(git checkout --ours:*)
---

<critical>
- Analyze embedded state below before acting
- If conflict shown, skip gt restack and route immediately
- Loop until restack completes successfully
- Use AskUserQuestion for all confirmations
</critical>

## Current State

**Repository status:**
!`git --no-pager -c color.ui=false status`

**Current stack:**
!`gt --no-color log short --stack`

## Workflow

### 1. Analyze State

Check `git status` output above:
- **"rebase in progress"** or **"Unmerged paths"** → Already in conflict, skip to step 3
- **Clean working tree** → Proceed to step 2

### 2. Run Restack (if clean state)

```bash
gt restack
```

**Outcomes:**
- **Success** → Acknowledge and skip to step 4
- **Conflicts** → Proceed to step 3

### 3. Route by Conflict Type

Analyze conflicted files from status above:

**Only pnpm-lock.yaml conflicted?**
→ See [lockfile-conflict.md](lockfile-conflict.md)

**Multiple files conflicted?**
→ See [complex-conflict.md](complex-conflict.md)

**Unexpected errors or state?**
→ See [troubleshooting.md](troubleshooting.md)

### 4. Success

Restack completed successfully!

**Next step:** Force push your stack

```bash
gt stack submit --force
# Or individual branch:
git push --force-with-lease origin <branch-name>
```

**Note:** Always use `--force-with-lease` for safety
