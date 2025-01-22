---
title: Troubleshooting
draft: true
prev:
  link: /edge-worker/monitoring
  label: Monitoring
next:
  link: /edge-worker/ideas
  label: Ideas
---

This page serves as a place to document common issues and their solutions.

## Worker stopped processing messages

This is the main issue with current implementation and I believe it is due
to abruptly terminated SQL connections - we use Session Mode after all,
so any abruptly-closed connection will rely on pooler's `idle_timeout`
to close it. If the timeout is too big it can lead to the depletion
of the pool - Workers will create more connections than will be reclained.
