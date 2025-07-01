# Snapshot Releases

> Temporary test versions for PR testing. Version format: `0.0.0-{tag}-{timestamp}`

## Quick Start

```bash
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

After publishing a snapshot:

### NPM Packages
```bash
npm install @pgflow/core@snapshot
npm install @pgflow/cli@snapshot
# Or specific version:
npm install @pgflow/core@0.0.0-my-feature-20240101120000
```

### JSR Package (Edge Worker)
```bash
deno add @pgflow/edge-worker@experimental
# Or in import map:
"@pgflow/edge-worker": "jsr:@pgflow/edge-worker@experimental"
```

## Script Options

### Local Development

| Command | Description |
|---------|-------------|
| `./scripts/snapshot-release.sh` | Use branch name as tag |
| `./scripts/snapshot-release.sh my-tag` | Custom tag |
| `./scripts/snapshot-release.sh --dry-run` | Preview only |
| `./scripts/snapshot-release.sh --npm-tag next` | Custom npm tag |

### CI Usage

```bash
./scripts/snapshot-release-ci.sh  # Auto-detects PR number
```

Features:
- 🔍 Auto-detects PR number/branch
- 📝 Generates install instructions
- 💬 Formats for PR comments

## How It Works

<details>
<summary>🔧 Technical Details</summary>

1. **Creates versions**: `changeset version --snapshot` → `0.0.0-{tag}-{timestamp}`
2. **Syncs JSR**: Runs `update-jsr-json-version.sh`
3. **Publishes**: npm with custom tag, then JSR
4. **Cleans up**: Reverts all version changes (branch stays clean!)
</details>

## Best Practices

> [!TIP]
> - Test with `--dry-run` first
> - Use descriptive tags: `fix-auth`, `feature-api`
> - Document snapshot version in PR description
> - Clean up old snapshots periodically

## Troubleshooting

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