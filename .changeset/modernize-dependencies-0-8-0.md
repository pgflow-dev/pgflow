---
'@pgflow/core': minor
'@pgflow/client': minor
'@pgflow/edge-worker': minor
'@pgflow/website': minor
---

BREAKING CHANGE: pgflow 0.8.0 requires pgmq 1.5.0+, PostgreSQL 17, and Supabase CLI 2.34.3+

This version modernizes infrastructure dependencies and will NOT work with pgmq 1.4.x or earlier. The migration includes a compatibility check that aborts with a clear error message if requirements are not met.

**Requirements:**
- pgmq 1.5.0 or higher (previously supported 1.4.x)
- PostgreSQL 17 (from 15)
- Supabase CLI 2.34.3 or higher (includes pgmq 1.5.0+)

**For Supabase users:** Upgrade your Supabase CLI to 2.34.3+ which includes pgmq 1.5.0 by default.

**For self-hosted users:** Upgrade pgmq to 1.5.0+ and PostgreSQL to 17 before upgrading pgflow.

**If you cannot upgrade immediately:** Stay on pgflow 0.7.x until your infrastructure is ready. The migration safety check ensures you cannot accidentally upgrade to an incompatible version.
