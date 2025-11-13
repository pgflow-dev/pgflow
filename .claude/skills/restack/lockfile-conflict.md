# Lockfile-Only Conflict Resolution

Simple case: Only `pnpm-lock.yaml` is conflicted. Lockfile is generated content, safe to regenerate.

## Resolution

Use AskUserQuestion:

```
question: "Only pnpm-lock.yaml is conflicted. Regenerate and continue?"
header: "Simple Resolution"
options:
  - label: "Yes, regenerate"
    description: "pnpm install && gt add -A && gt continue"
  - label: "Inspect first"
    description: "Show git diff pnpm-lock.yaml before proceeding"
```

If confirmed, execute:

```bash
pnpm install && gt add -A && gt continue
```

## Check Result

After `gt continue`:
- **Another conflict** → Return to SKILL.md routing
- **Success** → Proceed to success message in SKILL.md

## Broken Lockfile

If `pnpm install` shows "broken lockfile" warnings, ask:

```
question: "Lockfile corrupted. Delete and regenerate?"
header: "Broken Lockfile"
options:
  - label: "Yes, delete"
    description: "rm pnpm-lock.yaml && pnpm install && gt add -A && gt continue"
  - label: "Try auto-fix"
    description: "pnpm install might auto-fix without deleting"
```
