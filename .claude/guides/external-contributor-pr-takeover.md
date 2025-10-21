# Process: Taking Over External Contributor PRs

## When to Use This Process

Use this workflow when an external contributor submits a PR but cannot run CI checks due to missing credentials (API keys, secrets, etc.) that you don't want to share publicly.

## Prerequisites

- `gh` CLI installed and authenticated
- `wt` (worktree toolkit) configured
- Graphite (`gt`) installed
- Access to the main repository with push rights

## Complete Workflow

### Step 1: Review the PR and Get Author Information

```fish
# View PR details
gh pr view <PR_NUMBER>

# Get commit history and author details
gh pr view <PR_NUMBER> --json commits --jq '.commits[] | "\(.oid) - \(.authors[0].name) <\(.authors[0].email)>"'
```

**Example output:**
```
1b3d9d8d9d555b28b9f330fb934e91590a1cb13c - Martin Leduc <31558169+DecimalTurn@users.noreply.github.com>
0a410119a618c5c6df5bc62d92a53a445969e34e - Martin Leduc <31558169+DecimalTurn@users.noreply.github.com>
...
```

**Save this information:**
- Author name: e.g., "Martin Leduc"
- Author email: e.g., "31558169+DecimalTurn@users.noreply.github.com"
- GitHub username: e.g., "DecimalTurn"
- Number of commits (to know if squashing is needed)

### Step 2: Fetch PR Branch and Create Worktree

```fish
# Fetch the PR branch as your own local branch
git fetch origin pull/<PR_NUMBER>/head:<new-branch-name>

# Create a worktree for the branch (uses wt toolkit)
wt new <new-branch-name> --force-new --switch
```

**Branch naming convention:**
- Descriptive of the change
- Lowercase with hyphens
- Example: `restore-toml-patch-fork`

### Step 3: Squash Multiple Commits (Graphite Best Practice)

If the PR has multiple commits, squash them into a single commit:

```fish
# Reset commits but keep all changes staged
git reset --soft main
```

**Why squash?**
- Graphite recommends one commit per PR
- Cleaner git history
- Easier to review and revert if needed
- Follows pgflow's MVP philosophy of simplicity

### Step 4: Create Single Commit with Proper Attribution

```fish
git commit -m "<descriptive-title>

<detailed-description>

Changes:
- <bullet point of key changes>
- <another change>
- <etc>

Resolves #<issue-number>

Co-authored-by: <Author Name> <<author-email>>"
```

**Commit message template:**
```
<imperative-mood-title>

<1-3 paragraphs explaining what and why>

Changes:
- List of key modifications
- Another significant change
- Technical details if relevant

Resolves #<issue>

Co-authored-by: <Name> <email>
```

**Important notes:**
- Title should be imperative mood (e.g., "Add feature", not "Added feature")
- Include `Co-authored-by:` to give proper credit
- GitHub will link both you and the contributor in the PR
- Reference the original issue being resolved

### Step 5: Push and Create Your PR

```fish
# Force push (safe because it's a new branch)
git push -f -u origin <new-branch-name>

# Create PR with Graphite
gt submit --edit
```

**In the PR description, include:**
- Acknowledgment of original work
- Link to original PR
- Why you're resubmitting (e.g., "CI requires credentials")

**Example PR description addition:**
```markdown
---

Based on work by @<username> in #<original-PR-number>

Resubmitted to run CI with required credentials.
```

### Step 6: Communicate with the Contributor

Close or comment on the original PR:

```
Thanks for this contribution @<username>! I've created #<new-PR> based on
your work to run it through our CI (which needs some internal credentials).

You're credited as co-author in the commit. Let me know if you'd like any
changes!
```

## Real Example: PR #229

### Context
- **PR:** #229 - Restore toml-patch using @decimalturn/toml-patch
- **Author:** Martin Leduc (DecimalTurn)
- **Email:** 31558169+DecimalTurn@users.noreply.github.com
- **Commits:** 6 commits
- **Issue:** Resolves #143

### Actual Commands

```fish
# 1. Review PR
gh pr view 229
gh pr view 229 --json commits --jq '.commits[] | "\(.oid) - \(.authors[0].name) <\(.authors[0].email)>"'

# 2. Fetch and create worktree
git fetch origin pull/229/head:restore-toml-patch-fork
wt new restore-toml-patch-fork --force-new --switch

# 3. Squash 6 commits
git reset --soft main

# 4. Create single commit with attribution
git commit -m "Restore toml-patch using @decimalturn/toml-patch

This resolves #143 by switching from smol-toml to the maintained
fork @decimalturn/toml-patch which preserves comments when editing
TOML config files.

Changes:
- Replace smol-toml with @decimalturn/toml-patch
- Use TOML.patch() to preserve formatting/comments
- Update tests with explicit type annotations

Resolves #143

Co-authored-by: Martin Leduc <31558169+DecimalTurn@users.noreply.github.com>"

# 5. Push and submit
git push -f -u origin restore-toml-patch-fork
gt submit --edit
```

**In PR description:**
```markdown
Based on work by @DecimalTurn in #229

Resubmitted to run CI with required credentials.
```

## Alternative Approaches (Not Recommended)

### Option 1: Cherry-pick Range
```fish
git cherry-pick main..pr-229-temp
```
- **Cons:** More complex, potential for conflicts

### Option 2: Individual Cherry-picks
```fish
git cherry-pick <sha1> <sha2> <sha3>
```
- **Cons:** Tedious for multiple commits

### Option 3: Merge Squash
```fish
git merge --squash pr-229-temp
```
- **Cons:** Less control over commit message and history

### Why Option 4 (Documented Above) is Best
✅ Preserves attribution naturally
✅ Simplest workflow
✅ Full control over final commit
✅ Follows Graphite best practices
✅ Aligns with MVP philosophy (fastest approach)
✅ Proper git history with co-authorship

## Key Principles

1. **Always credit the contributor** - Use `Co-authored-by:` in commits
2. **Communicate transparently** - Explain why you're taking over the PR
3. **Follow Graphite conventions** - Single commit per PR when possible
4. **Maintain git attribution** - Original author should be visible in git history
5. **Be respectful** - The contributor did the work, you're just helping it get merged

## Common Issues

### GitHub Noreply Email
If the author email is `<number>+<username>@users.noreply.github.com`, this is GitHub's privacy-protected email. It's perfectly valid for the `Co-authored-by:` field.

### Multiple Logical Changes
If the PR contains multiple unrelated changes that should be separate commits:
1. Still fetch their branch
2. Use `git reset --soft main`
3. Stage changes separately: `git add <files-for-change-1>`
4. Commit each logical change separately
5. Each commit should have its own `Co-authored-by:` line

### Contributor Makes Updates After You Fetch
If they push new commits after you've started:
```fish
# Fetch latest
git fetch origin pull/<PR_NUMBER>/head

# Rebase or cherry-pick new commits
git cherry-pick <new-commit-sha>
```

## Checklist

- [ ] Get PR number and review changes
- [ ] Extract author name and email
- [ ] Note GitHub username for mentions
- [ ] Fetch PR branch with descriptive name
- [ ] Create worktree using `wt new`
- [ ] Squash commits if multiple exist
- [ ] Write detailed commit message with Co-authored-by
- [ ] Reference original issue (Resolves #X)
- [ ] Push to origin
- [ ] Create PR with `gt submit`
- [ ] Add acknowledgment in PR description
- [ ] Comment on original PR explaining the takeover
- [ ] Thank the contributor
