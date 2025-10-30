---
'@pgflow/core': patch
---

Fix installation failures on new Supabase projects by removing pgmq version pin.

Supabase upgraded to pgmq 1.5.1 in Postgres 17.6.1.016+ (https://github.com/supabase/postgres/pull/1668), but pgflow was pinned to 1.4.4, causing "extension has no installation script" errors on fresh instances.

Only affects new projects - existing installations are unaffected and require no action.

Thanks to @kallebysantos for reporting this issue!
