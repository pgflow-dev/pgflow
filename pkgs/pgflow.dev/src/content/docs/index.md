---
title: pgflow
template: splash
hero:
  tagline: Simple, Postgres-First Workflow Orchestration for Supabase
  image:
    file: ../../assets/nodes-group-logo.svg
---

**pgflow** is a Postgres-first workflow engine I began building in November. I wanted a **deeply integrated**, open-source solution that **runs entirely on Supabase—no external workers or self-hosting required**. Since I couldn’t find one, I decided to build it.

#### Edge Function Worker

I've build a task queue worker for PGMQ that runs entirely on Supabase Edge Functions
**without any external dependencies**.

It's designed to **auto-respawn** and **gracefully shut down**, with configurable concurrency. It relies on **visibility timeout** and handler **idempotency** to handle retries and edge function early termination.

##### Can I use it now?

**Not yet** - I'm aiming to have the first version ready in early 2024.

Living with **ADHD**, I bring a lot of **hyperfocus** and **passion** to this project, but my process can be a bit scattered at times, and the scope can feel huge.
The **Supabase Edge Function Worker**, a critical piece of pgflow, is already extracted from my private stuff and lives happily in a new monorepo. Stay tuned!

##### Have questions or want to say Hi?

I'm `u/jumski` on Reddit, [@jumski](https://github.com/jumski) on GitHub and `@jumski` on Supabase Discord.
