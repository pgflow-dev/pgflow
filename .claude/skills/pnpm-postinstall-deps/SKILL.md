---
name: pnpm-postinstall-deps
description: Use when user adds package with postinstall script (supabase, sharp), gets "binary not found" errors in CI, or asks about onlyBuiltDependencies. Explains the two-step pattern for managing packages that need build/postinstall scripts in pnpm workspaces with frozen lockfiles.
---

# pnpm Postinstall Dependencies

Manage packages that need postinstall scripts in pnpm workspaces.

## The Problem

`pnpm install --frozen-lockfile --prefer-offline` in CI restores from cache and skips postinstall scripts. Packages like `supabase` download binaries via postinstall - without it, the binary doesn't exist.

## The Pattern

**Two-step sync required:**

1. **pnpm-workspace.yaml** - Declares which packages are allowed to run build scripts
2. **Setup action** - Explicitly rebuilds those packages after install

<critical>
Both lists MUST stay in sync. If they diverge:
- Missing in yaml → Package can't run postinstall (security)
- Missing in action → Binary won't be available in CI
</critical>

## Checklist

When adding a package that needs postinstall:

### 1. Add to pnpm-workspace.yaml

```yaml
onlyBuiltDependencies:
  - supabase
  - sharp
  - your-new-package  # Add here
```

### 2. Update .github/actions/setup/action.yml

```yaml
- name: Rebuild packages that need postinstall (onlyBuiltDependencies)
  shell: bash
  run: pnpm rebuild supabase sharp your-new-package  # Add here
```

### 3. Verify

Check both files have identical package lists.

## Why Explicit Package Names?

`pnpm rebuild --pending` is too implicit - unclear if it respects onlyBuiltDependencies. Explicit names guarantee behavior and make configuration visible.

## Common Packages

- `supabase` - Downloads CLI binary from GitHub releases
- `sharp` - Builds native image processing library
- `esbuild` - Downloads platform-specific binary
- `puppeteer` - Downloads Chromium binary
