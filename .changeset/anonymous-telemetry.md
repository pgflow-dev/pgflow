---
'@pgflow/core': patch
'@pgflow/edge-worker': patch
---

Add anonymous, opt-out telemetry. A daily `pg_cron` job aggregates yesterday's `pgflow.*` activity into coarse, identifier-free buckets (versions in use, run and worker counts, flow shapes, feature adoption, durations) and sends one small payload through `pg_net` to a Cloudflare Worker backed by Workers Analytics Engine. Workers stamp their package version at registration. Nothing identifying is ever sent; every payload is stored locally in `pgflow_telemetry.sent_reports` for audit; `pgflow_telemetry.preview()` shows any day's payload without sending; `pgflow_telemetry.disable()` opts out permanently (the cron job row is the switch) and local development databases never report.
