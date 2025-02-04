---
title: Ideas
draft: true
prev:
  link: /edge-worker/troubleshooting
  label: Troubleshooting
---

This page is a place to store ideas for improving various parts of the Edge Worker.

### Configurable heartbeat interval

We can add `heartbeatIntervalSeconds` to configuration and save it in `workers` table
when worker starts, so we can write appropriate `active_workers` and `inactive_workers`
SQL views that will compare `now() - heartbeat_interval` with `last_heartbeat_at` column.
