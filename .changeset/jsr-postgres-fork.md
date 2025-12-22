---
'@pgflow/edge-worker': patch
'@pgflow/dsl': patch
'pgflow': patch
---

Fix Supabase Edge Runtime compatibility by replacing npm:postgres with jsr:@oscar6echo/postgres fork. The npm package fails to parse database URLs in Deno edge environments, causing CONNECT_TIMEOUT errors.
