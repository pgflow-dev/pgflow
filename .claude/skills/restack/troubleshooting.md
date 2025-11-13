# Troubleshooting

## `gt continue` Fails

**Check for unresolved conflicts or unstaged files:**

```bash
git --no-pager -c color.ui=false status
```

Look for "Unmerged paths" or unstaged changes. Stage and continue:

```bash
gt add -A && gt continue
```

## pnpm Install Warnings

**Bin file warnings** (e.g., supabase CLI):
- Usually safe to ignore
- Known installation quirks, doesn't affect lockfile

## Unsure --ours vs --theirs

Both versions shown in complex-conflict.md. General rule:
- **Consistency with main** (`--theirs`) when in doubt
- **Preserve your changes** (`--ours`) for features

## Abort Restack

Cancel entire restack:

```bash
gt abort
```

Reverts to pre-restack state.
