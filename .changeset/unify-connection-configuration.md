---
'pgflow': patch
'@pgflow/dsl': patch
'@pgflow/edge-worker': patch
---

Unify connection configuration with improved local detection. The `connectionString` config option now works correctly, and you can pass a raw postgres.js `sql` instance via `config.sql` for full control over connection options (SSL, pooling, etc.).

Fixes [#469](https://github.com/pgflow-dev/pgflow/issues/469), [#424](https://github.com/pgflow-dev/pgflow/issues/424). Thanks to [@Nciso](https://github.com/Nciso), [@mikz](https://github.com/mikz), [@ddlaws0n](https://github.com/ddlaws0n), and **PixelEcho** for feedback and bug reports.
