You are tasked with creating a changeset file for the pgflow monorepo.

## Context

User description:
<description>
$ARGUMENTS
</description>

## Available Packages

- pgflow
- @pgflow/client
- @pgflow/core
- @pgflow/dsl
- @pgflow/edge-worker
- @pgflow/example-flows
- @pgflow/website

## Versioning Scheme (Pre-1.0)

- **patch** (0.5.1 → 0.5.2): Bug fixes and small backward-compatible features
- **minor** (0.5.0 → 0.6.0): Breaking changes and major updates

## Process

### Step 1: Detect Repo State and Analyze Changes

First, check if the repository is clean or dirty:

<repo-status>
!`git status --short`
</repo-status>

Based on the repo status above, run the appropriate git commands:

**If repo is CLEAN (no output above):**
- Run `git log -1 --pretty=format:'%s'` to get the commit message
- Run `git show HEAD --stat --pretty=format:''` to see changed files in HEAD

**If repo is DIRTY (has output above):**
- Run `git diff HEAD --stat` to see all staged and unstaged changes

Map changed files to affected packages based on the `pkgs/` directory structure:
- `pkgs/cli/` → pgflow
- `pkgs/client/` → @pgflow/client
- `pkgs/core/` → @pgflow/core
- `pkgs/dsl/` → @pgflow/dsl
- `pkgs/edge-worker/` → @pgflow/edge-worker
- `pkgs/example-flows/` → @pgflow/example-flows
- `pkgs/website/` → @pgflow/website

**IMPORTANT**: Only changes in `pkgs/` directories should trigger changeset creation. Root file changes should be ignored.

### Step 2: Determine Bump Type

Based on the changes and user description, determine if this is:
- **patch**: Bug fix or small backward-compatible improvement
- **minor**: Breaking change or major update

Present your analysis to the user and ask for confirmation of the bump type.

### Step 3: Generate Filename

Create a unique 3-word slug for the filename using:
- Simple, descriptive words related to the change
- Lowercase with hyphens
- Example: `tame-shoes-yell.md`, `brave-lions-run.md`

### Step 4: Create Changeset

Write the changeset file to `.changeset/<unique-slug>.md` with this format:

```
---
'<package1>': <bump-type>
'<package2>': <bump-type>
---

<Concise description of the change>
```

**Requirements:**
- List all affected packages in the frontmatter
- Use single quotes around package names
- Keep description concise (1-2 lines)
- No fancy characters (straight quotes, hyphens only)

## Example

For a bug fix in @pgflow/client:

```
---
'@pgflow/client': patch
---

Fix connection timeout handling in worker pool
```
