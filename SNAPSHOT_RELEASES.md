# Snapshot Releases

Snapshot releases allow you to publish temporary test versions of pgflow packages without affecting the main release process. This is perfect for testing changes before merging PRs.

## Why Snapshots Over Prerelease Mode?

**Snapshots are better for testing because:**
- ✅ **No state management** - No pre.json file to track
- ✅ **No commits required** - Versions are temporary and reverted after publishing
- ✅ **Branch stays clean** - Safe to merge after testing
- ✅ **Clear temporary versions** - Uses `0.0.0-*` format
- ✅ **One command** - Simple to create and publish

**Prerelease mode is more complex:**
- ❌ Requires entering/exiting state
- ❌ Creates commits that must be managed
- ❌ More steps and potential for errors
- ❌ Can accidentally publish to "latest" tag

## Usage

### Local Development

Create a snapshot release from your current branch:

```bash
# Use branch name as snapshot tag
./scripts/snapshot-release.sh

# Use custom tag
./scripts/snapshot-release.sh my-feature

# Dry run to see what would happen
./scripts/snapshot-release.sh fix-123 --dry-run

# Use custom npm tag
./scripts/snapshot-release.sh test --npm-tag experimental
```

### CI Environment

The CI wrapper automatically detects PR numbers and generates installation instructions:

```bash
# In your CI workflow
./scripts/snapshot-release-ci.sh
```

This will:
- Detect PR number/branch name automatically
- Create snapshot with appropriate tag
- Generate installation instructions for PR comments
- Output to GitHub Actions summary (if applicable)

## How It Works

1. **Creates snapshot versions** using `changeset version --snapshot`
   - Versions become `0.0.0-{tag}-{timestamp}`
   
2. **Syncs JSR versions** using existing update script
   - Updates jsr.json files to match package.json versions
   
3. **Publishes to registries**
   - NPM packages with `pr-snapshot` or custom tag
   - Edge Worker to JSR with matching tag
   
4. **Restores original versions**
   - Reverts all package.json and jsr.json changes
   - Keeps your branch clean and mergeable

## Installation Instructions

After publishing, install snapshot packages:

### NPM Packages
```bash
# Using the snapshot tag
npm install @pgflow/core@snapshot
npm install @pgflow/cli@snapshot

# Using specific version
npm install @pgflow/core@0.0.0-my-feature-20240101120000
```

### JSR Package (Edge Worker)
```bash
# Using deno
deno add @pgflow/edge-worker@experimental

# In import map
{
  "imports": {
    "@pgflow/edge-worker": "jsr:@pgflow/edge-worker@experimental"
  }
}
```

## Best Practices

1. **Always test locally first** with `--dry-run`
2. **Use descriptive tags** like `fix-auth-bug` or `feature-new-api`
3. **Don't commit snapshot versions** - the script handles cleanup
4. **Document in PRs** which snapshot version to test
5. **Clean up old snapshots** periodically from npm/jsr

## Troubleshooting

### "Changesets CLI not found"
Install changesets: `pnpm add -D @changesets/cli`

### "You have uncommitted changes"
Either commit your changes or answer "y" to continue anyway

### JSR publish fails
- Check you're logged in: `jsr login`
- Ensure edge-worker has a valid jsr.json
- Try with `--allow-slow-types` flag

### Versions not updated
- Check that update-jsr-json-version.sh is executable
- Ensure jq is installed for JSON processing