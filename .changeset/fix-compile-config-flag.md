---
'pgflow': patch
---

Fix: Use --config instead of --import-map for Deno compilation

The compile command now uses Deno's --config flag instead of --import-map, enabling full deno.json support including nodeModulesDir, compilerOptions, unstable features, and other configuration options. Previously, these options would cause "Invalid top-level key" warnings.

This is a backward-compatible bug fix. Existing deno.json files with only "imports" continue to work as before.
