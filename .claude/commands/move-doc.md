You are tasked with moving or renaming documentation files with proper git history preservation, link updates, and redirect configuration.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Current directory structure:
<structure>
!`tree pkgs/website/src/content/docs/ -L 2 -d`
</structure>

Astro config location: `pkgs/website/astro.config.mjs`

User request:
<request>
$ARGUMENTS
</request>

## Multi-Step Process

### Step 1: Parse Move Request

Determine:
1. **Source file(s)**: Which file(s) to move
2. **Destination**: Where to move them
3. **Reason**: Why this move (helps with redirect reasoning)

**If source unclear:**
- Search for matching files
- Present options to user
- WAIT for confirmation

**If destination unclear:**
- Suggest destination based on content type and Diataxis
- Present suggestion to user
- WAIT for confirmation

Present plan:
```markdown
## Move Plan

**Source:** pkgs/website/src/content/docs/[old-path]
**Destination:** pkgs/website/src/content/docs/[new-path]
**Reason:** [brief explanation]

**Old URL:** /[old-path]/
**New URL:** /[new-path]/
```

WAIT for user approval.

### Step 2: Check for Inbound Links

Before moving, find all files that link to this page:

```bash
# Search for references to the old path
grep -r "[old-path]" pkgs/website/src/content/docs/ --include="*.mdx"
```

Present findings:
```markdown
## Impact Analysis

**Files linking to this page:** [count]
[List files with line numbers if not too many]

These links will need to be updated.
```

### Step 3: Create Destination Directory (if needed)

If destination directory doesn't exist:
```bash
mkdir -p pkgs/website/src/content/docs/[destination-dir]/
```

### Step 4: Move File with Git

Use `git mv` to preserve history:
```bash
git mv pkgs/website/src/content/docs/[old-path] pkgs/website/src/content/docs/[new-path]
```

Confirm move successful.

### Step 5: Update All Internal Links

For each file that referenced the old path:
1. Read the file
2. Find all occurrences of old path
3. Replace with new path (maintaining trailing slashes)
4. Use Edit tool to update

**Link patterns to update:**
- Markdown links: `[text](/old-path/)` → `[text](/new-path/)`
- LinkCard href: `href="/old-path/"` → `href="/new-path/"`
- Link attribute: `link="/old-path/"` → `link="/new-path/"`

Present summary of link updates.

### Step 6: Add Redirect Entry

Read current redirects section from `pkgs/website/astro.config.mjs`.

Add new redirect entry:
```javascript
redirects: {
  // ... existing redirects ...
  '/old-path/': '/new-path/', // [Brief reason for redirect]
}
```

Use Edit tool to add redirect to astro.config.mjs.

### Step 7: Update Navigation (if needed)

Check if moved file affects sidebar navigation in astro.config.mjs:

**If using autogenerate:**
- No action needed (autogenerate will pick up new location)

**If manually listed:**
- Update the link in sidebar configuration

### Step 8: Verify and Test

Run these checks:
1. **File exists at new location:**
   ```bash
   ls -la pkgs/website/src/content/docs/[new-path]
   ```

2. **All links updated:**
   ```bash
   # Should return no results
   grep -r "[old-path]" pkgs/website/src/content/docs/ --include="*.mdx"
   ```

3. **Redirect added:**
   ```bash
   grep "[old-path]" pkgs/website/astro.config.mjs
   ```

4. **Build passes:**
   ```bash
   pnpm nx build website
   ```

Present verification results.

### Step 9: Create Commit

Prepare a structured commit message:
```
refactor(docs): move [filename] to [new-location]

- Move: [old-path] → [new-path]
- Update [count] internal links
- Add redirect for old URL
- Reason: [brief explanation]

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

Present commit message to user.

If approved, create commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
[commit message here]
EOF
)"
```

## Common Move Patterns

### Pattern 1: Reorganization (Build → Develop)
```
FROM: pkgs/website/src/content/docs/how-to/create-tasks.mdx
TO:   pkgs/website/src/content/docs/develop/authoring/create-tasks.mdx

Redirect: '/how-to/create-tasks/': '/develop/authoring/create-tasks/'
```

### Pattern 2: Content Type Correction (Tutorial → Concept)
```
FROM: pkgs/website/src/content/docs/get-started/understanding-flows.mdx
TO:   pkgs/website/src/content/docs/concepts/flows/understanding-flows.mdx

Redirect: '/get-started/understanding-flows/': '/concepts/flows/understanding-flows/'
Reason: Content is explanatory, not tutorial
```

### Pattern 3: Grouping Related Content
```
FROM: pkgs/website/src/content/docs/reference/configuration.mdx
TO:   pkgs/website/src/content/docs/reference/configuration/flow-config.mdx

Redirect: '/reference/configuration/': '/reference/configuration/flow-config/'
Note: May need index.mdx in configuration/ directory
```

## Batch Moves

If multiple files need moving together:

### Step 1: Present Batch Plan
```markdown
## Batch Move Plan

1. [file1] → [dest1]
2. [file2] → [dest2]
...

**Total files:** [count]
**Redirects to add:** [count]
**Estimated link updates:** [count]
```

WAIT for approval.

### Step 2: Process Each File
- Move all files with git mv
- Collect all link updates needed
- Update all links in one pass
- Add all redirects in one edit

### Step 3: Verify Batch
- Check all files moved
- Check all links updated
- Check all redirects added
- Run build

## Important Reminders

- **Always use git mv** - preserves file history
- **Always add redirects** - never break old URLs
- **Update ALL links** - grep comprehensively
- **Test build** - catch broken links early
- **Commit atomically** - one logical move per commit (or one batch)
- **Clear commit messages** - explain the why

## Error Handling

**If destination file already exists:**
- Warn user
- Ask if should overwrite or choose different name
- Never silently overwrite

**If links can't be auto-updated:**
- Flag them for manual review
- Show context around each link
- Ask user how to handle

**If build fails after move:**
- Show build error
- Try to identify cause
- Offer to revert if needed

**If too many links to update (>20):**
- Warn user about large impact
- Ask for confirmation before proceeding
- Consider if reorganization plan needs adjustment

## Special Cases

**Moving index.mdx files:**
- These affect parent directory URLs
- May need multiple redirects (with and without /index/)
- Check sidebar configuration carefully

**Moving files with anchors:**
- Update links with anchors: `/old-path/#section` → `/new-path/#section`
- Grep for anchor references

**Moving to existing directories:**
- Check for naming conflicts
- Verify autogenerate patterns still work

**Cross-package moves:**
- Very rare, but if moving between packages
- Update package-specific config
- More complex redirect handling

## Output

Use these tools:
1. **Bash** - for git mv, directory creation, verification
2. **Edit** - for link updates and redirect additions
3. **Grep** - for finding references

Present clear summary of all changes:
```markdown
## Move Complete: [filename]

✓ File moved (git history preserved)
✓ [count] links updated across [count] files
✓ Redirect added to astro.config.mjs
✓ Build verification passed

**Commit created** - ready to push
```
