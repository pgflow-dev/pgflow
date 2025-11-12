---
'@pgflow/core': minor
'@pgflow/edge-worker': minor
---

BREAKING CHANGE: This version requires pgmq 1.5.0 or higher and will NOT work with pgmq 1.4.x.

The code now depends on schema changes introduced in pgmq 1.5.0 (specifically the headers column in message_record type). The compatibility layer that allowed pgflow to work with pgmq 1.4.x has been removed.

If you are using Supabase, pgmq 1.5.0+ is included by default in recent versions. If you are self-hosting, you must upgrade pgmq to version 1.5.0 or higher before upgrading pgflow.
