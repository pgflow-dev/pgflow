# Release Process

> How pgflow automatically releases packages to npm and JSR via CI.

## TL;DR - The Three-Step Process

1. 📝 **Developer** creates changeset + merges feature PR
2. 🤖 **CI** creates "Version Packages" PR (updates versions & changelogs)
3. ✅ **Maintainer** merges the Version Packages PR
4. 🚀 **CI** publishes to npm + JSR automatically
5. 🌐 **Maintainer** updates website to use new package versions (separate PR)

All releases happen through GitHub Actions - no manual publishing.

## Step-by-Step Process

### 1. Making Changes

When making changes to any package:

```bash
pnpm changeset  # Create changeset file
```

This will:
- Ask which packages changed
- Ask for version bump type (major/minor/patch)
- Ask for changelog description

Then commit the `.changeset/*.md` file with the code changes.

### 2. Automatic Version PR

After feature PRs with changesets are merged to main:

🤖 **CI automatically creates "Version Packages" PR** containing:
- Updated version numbers in all package.json files
- Updated CHANGELOG.md files
- Synced jsr.json versions (via `update-jsr-json-version.sh`)

> [!NOTE]
> All pgflow packages use "fixed" versioning - they share the same version number.

### 3. Automatic Publishing

When the Version Packages PR is merged:

🚀 **CI runs the release workflow** (`.github/workflows/release.yml`):

```bash
# 1. Build all packages
pnpm nx run-many -t build --exclude=playground

# 2. Publish to npm (all packages except edge-worker)
pnpm publish --recursive --filter=!./pkgs/edge-worker

# 3. Publish edge-worker to JSR
cd ./pkgs/edge-worker && jsr publish --allow-slow-types

# 4. Create and push git tags
pnpm changeset tag && git push --follow-tags
```

<details>
<summary>📦 Why npm first, then JSR?</summary>

edge-worker imports npm packages via `npm:@pgflow/core@0.5.0`. If JSR published first, it would reference non-existent npm versions.
</details>

### 4. Update Website (Separate PR)

After packages are published, create a separate PR to update the website with the new package versions and merge any documentation for the new features.

**Critical Order: Packages First, Docs Second**

Since the website deploys from main branch:
1. **Never merge documentation for unreleased features to main**
2. **Always release packages first**, then merge docs
3. This prevents users from reading docs for features they can't install

**Documentation Workflow:**
- Write features and docs in the same PR if desired
- **But hold docs changes** (separate PR or don't merge yet)  
- Release packages from current main branch state
- **Only after packages are published**, merge the documentation changes
- Website then deploys with docs for features users can actually use

> [!WARNING]
> **Never merge docs to main before package release** - this will deploy documentation for unreleased features, confusing users who can't install them yet.

## Configuration Details

<details>
<summary>⚙️ Fixed Versioning Setup</summary>

`.changeset/config.json`:
```json
{
  "fixed": [["@pgflow/*", "pgflow"]]
}
```

All pgflow packages share the same version and release together.
</details>

<details>
<summary>🔄 Version Syncing (npm → JSR)</summary>

`update-jsr-json-version.sh` automatically:
- Copies version from package.json → jsr.json
- Updates import versions: `"@pgflow/core": "npm:@pgflow/core@0.5.0"`

This keeps JSR packages in sync with npm versions.
</details>

## Release Types

| Type | Version Example | When to Use | See |
|------|----------------|-------------|-----|
| **Regular** | `0.5.0` | Stable releases | This doc |
| **Snapshot** | `0.0.0-fix-auth-...` | PR testing | [SNAPSHOT_RELEASES.md](./SNAPSHOT_RELEASES.md) |

## CI Requirements

> [!IMPORTANT]
> Release workflow needs these GitHub secrets:
> - `NPM_TOKEN` - npm publishing
> - `GITHUB_TOKEN` - PR creation (auto-provided)
> - OIDC permissions - JSR publishing

## Quick Reference

<details>
<summary>📝 Adding a Feature</summary>

```bash
# 1. Make changes
# 2. Create changeset
pnpm changeset
# 3. Commit & push
# 4. Merge PR
# 5. Wait for Version PR → merge it
# 6. Create separate PR to update website
```
</details>

<details>
<summary>🐛 Fixing a Bug</summary>

```bash
# 1. Fix bug
# 2. Create changeset (usually patch)
pnpm changeset
# 3. Commit & push
# 4. Merge PR
# 5. Wait for Version PR → merge it
# 6. Create separate PR to update website
```
</details>

<details>
<summary>🧪 Testing Before Release</summary>

Use snapshot releases - see [SNAPSHOT_RELEASES.md](./SNAPSHOT_RELEASES.md)
</details>

<details>
<summary>🌐 Updating Website Only</summary>

For website-only changes (typos, content updates, new documentation):

```bash
# 1. Make website changes in pkgs/website/
# 2. Commit & push directly to main (no changeset needed)
# 3. Website auto-deploys from main branch

# No package version updates needed for content-only changes
```

Website uses pinned package versions, so content updates don't affect package synchronization.
</details>

## Troubleshooting

<details>
<summary>🛑 "No changesets found"</summary>

Run `pnpm changeset` before pushing. CI requires changesets for package changes.
</details>

<details>
<summary>🛑 Version mismatch npm/JSR</summary>

- Check `update-jsr-json-version.sh` ran in Version PR
- package.json and jsr.json versions must match
</details>

<details>
<summary>🛑 JSR publish fails</summary>

- Already uses `--allow-slow-types`
- Check JSR dashboard for specific errors
- Ensure OIDC permissions are configured
</details>