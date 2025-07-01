# Snapshot Releases

> Temporary test versions for PR testing. Version format: `0.0.0-{tag}-{timestamp}`

## Quick Start

**Prerequisites:** You need at least one changeset for packages to publish.

```bash
# First, create a changeset
pnpm changeset

# Then create snapshot
./scripts/snapshot-release.sh              # Uses branch name as tag
./scripts/snapshot-release.sh my-feature   # Custom tag
./scripts/snapshot-release.sh --dry-run    # Preview only
```

<details>
<summary>💡 Why snapshots instead of prerelease mode?</summary>

| Snapshots | Prerelease Mode |
|-----------|-----------------|
| ✅ No state files | ❌ Manages pre.json |
| ✅ No commits | ❌ Requires commits |
| ✅ Branch stays clean | ❌ Branch has version changes |
| ✅ One command | ❌ Enter/exit commands |
| ✅ Can't hit "latest" | ⚠️ Risk of "latest" publish |
</details>

## Installation

Snapshots are published with exact versions. Always install using the full version:

### NPM Packages
```bash
npm install @pgflow/core@0.0.0-my-feature-20240101120000
npm install @pgflow/cli@0.0.0-my-feature-20240101120000
npm install @pgflow/client@0.0.0-my-feature-20240101120000
npm install @pgflow/dsl@0.0.0-my-feature-20240101120000
```

### JSR Package (Edge Worker)
```bash
deno add @pgflow/edge-worker@0.0.0-my-feature-20240101120000
# Or in import map:
"@pgflow/edge-worker": "jsr:@pgflow/edge-worker@0.0.0-my-feature-20240101120000"
```

> [!TIP]
> The script outputs exact install commands - just copy and paste!

> [!NOTE]
> npm packages are published with dist-tag "snapshot" to protect the "latest" tag.
> Always use exact versions - never install with `@snapshot`.

## Available Scripts

### `snapshot-release.sh`

Main script for creating snapshot releases locally or in CI.

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `[tag]` | Custom snapshot tag | Branch name |
| `--dry-run` | Preview without publishing | false |
| `--help` | Show usage | - |

**Examples:**
```bash
./scripts/snapshot-release.sh              # Uses branch name
./scripts/snapshot-release.sh my-feature   # Custom tag
./scripts/snapshot-release.sh --dry-run    # Preview only
```

**Output:**
- Shows all packages being published with exact versions
- Prints ready-to-use install commands
- Creates JSON output at `/tmp/snapshot-release-output.json` for CI integration
- Uses "snapshot" dist-tag to protect "latest" (but you always install by version)

### `snapshot-release-ci.sh`

CI-specific wrapper that auto-detects environment and generates PR comments.

**Features:**
- 🔍 Auto-detects PR number/branch from CI environment
- 📝 Generates installation instructions
- 💬 Outputs to GitHub Actions summary
- 🤖 Supports GitHub Actions, GitLab CI, CircleCI

**Usage:**
```bash
./scripts/snapshot-release-ci.sh  # No arguments needed
```

**Output:** Creates markdown file with installation instructions for PR comments.

## How It Works

<details>
<summary>🔧 Technical Details</summary>

1. **Creates versions**: `changeset version --snapshot` → `0.0.0-{tag}-{timestamp}`
2. **Syncs JSR**: Runs `update-jsr-json-version.sh`
3. **Publishes**: npm with "snapshot" tag (protects "latest"), then JSR
4. **Cleans up**: Automatically reverts all version changes via trap (even on errors!)
   - Uses `git restore --source=HEAD` for reliable cleanup
   - Branch always stays clean
</details>

## Best Practices

> [!TIP]
> - Test with `--dry-run` first
> - Use descriptive tags: `fix-auth`, `feature-api`
> - Document snapshot version in PR description
> - Clean up old snapshots periodically

## Troubleshooting

<details>
<summary>🛑 "No unreleased changesets found"</summary>

Snapshot releases require changesets to work. Create one first:
```bash
pnpm changeset  # Select packages and describe changes
```
</details>

<details>
<summary>🛑 "Changesets CLI not found"</summary>

```bash
pnpm add -D @changesets/cli
```
</details>

<details>
<summary>🛑 "You have uncommitted changes"</summary>

Commit changes or answer "y" to continue anyway
</details>

<details>
<summary>🛑 JSR publish fails</summary>

- Run `jsr login`
- Check edge-worker has jsr.json
- Script already uses `--allow-slow-types`
</details>

<details>
<summary>🛑 Versions not updated</summary>

- Make `update-jsr-json-version.sh` executable
- Install jq: `brew install jq` or `apt install jq`
</details>