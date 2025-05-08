---
'pgflow': patch
---

Improve migration copy functionality in CLI

- always generate a new timestamp-id for the copied migration
- prepend the timestamp to the original migration name
- when comparing installed migrations to source migrations, search for source migration filename

This change should be backwards compatible with already installed migrations,
because the matching logic will just match the source filename in destination folder.
