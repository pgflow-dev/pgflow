# Snapshot Releases

> Temporary test versions for PR testing. Version format: `0.0.0-{tag}-{timestamp}-{sha}`

## 🎯 Quick Cheatsheet

```bash
# Most common usage - just copy & paste:
pnpm exec changeset                        # 1. Create changeset (select packages)
./scripts/snapshot-release.sh my-feature   # 2. Publish snapshot (asks for confirmation)

# Other options:
./scripts/snapshot-release.sh              # Use branch name as tag
./scripts/snapshot-release.sh --dry-run    # Preview only, no publishing
./scripts/snapshot-release.sh --yes        # Skip confirmation (for CI)
```

**That's it!** The script handles everything else - versions, publishing, cleanup.

## Prerequisites

You need at least one changeset for packages to publish. If you forget, the script will remind you.

<details>
<summary>💡 Why snapshots instead of prerelease mode?</summary>

| Snapshots             | Prerelease Mode               |
| --------------------- | ----------------------------- |
| ✅ No state files     | ❌ Manages pre.json           |
| ✅ No commits         | ❌ Requires commits           |
| ✅ Branch stays clean | ❌ Branch has version changes |
| ✅ One command        | ❌ Enter/exit commands        |
| ✅ Can't hit "latest" | ⚠️ Risk of "latest" publish   |

</details>

## Installation

The script outputs exact install commands at the end - just copy and paste!

Example output:

```bash
npm install @pgflow/core@0.0.0-my-feature-20240101120000-abc1234
npm install pgflow@0.0.0-my-feature-20240101120000-abc1234
npm install @pgflow/client@0.0.0-my-feature-20240101120000-abc1234
npm install @pgflow/dsl@0.0.0-my-feature-20240101120000-abc1234

# For Deno/Supabase Edge Functions:
import { EdgeWorker } from "jsr:@pgflow/edge-worker@0.0.0-my-feature-20240101120000-abc1234"
```

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
| `--dry-run` | Preview only, don't publish | false |
| `--yes`, `-y` | Skip confirmation prompt | false |
| `--no-cleanup` | Don't restore files after publishing | false |
| `--help` | Show usage | - |

**Examples:**

```bash
./scripts/snapshot-release.sh              # Uses branch name, asks for confirmation
./scripts/snapshot-release.sh my-feature   # Custom tag, asks for confirmation
./scripts/snapshot-release.sh my-feature --dry-run  # Preview only, no publishing
./scripts/snapshot-release.sh my-feature --yes      # Skip confirmation
```

**Output:**

- Shows formatted version breakdown with timestamp and commit SHA
- Lists all packages being published with exact versions
- Interactive confirmation prompt before publishing (unless --yes)
- Prints ready-to-use install commands with colored output
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

1. **Creates versions**: `changeset version --snapshot` → `0.0.0-{tag}-{timestamp}-{sha}`
2. **Syncs JSR**: Runs `update-jsr-json-version.sh`
3. **Publishes**: npm with "snapshot" tag (protects "latest"), then JSR
4. **Cleans up**: Automatically reverts all version changes via trap (even on errors!)
   - Uses `git restore --source=HEAD` for reliable cleanup (falls back to `git checkout` for older git)
   - Branch always stays clean
   - Works in CI and locally
   </details>

## Best Practices

> [!TIP]
>
> - Test with `--dry-run` first
> - Use descriptive tags: `fix-auth`, `feature-api`
> - Document snapshot version in PR description
> - Clean up old snapshots periodically

## Troubleshooting

<details>
<summary>🛑 "No unreleased changesets found"</summary>

Snapshot releases require changesets to work. Create one first:

```bash
pnpm exec changeset  # Select packages and describe changes
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

Changesets will warn about uncommitted changes. You can:

- Answer "y" to continue anyway (recommended for local testing)
- Or commit your changes first: `git add . && git commit -m 'Your message'`
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
