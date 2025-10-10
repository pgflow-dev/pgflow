---
'pgflow': patch
---

Fix config.toml corruption with minimal configs while preserving comments. Switch to @decimalturn/toml-patch 0.3.7 (maintained fork) which fixes issue #143 and preserves TOML comments and formatting. Thanks to @DecimalTurn for maintaining the fork and contributing this fix.
