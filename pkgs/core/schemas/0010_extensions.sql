-- Extensions must be created first
create extension if not exists pgmq;

-- Extensions for worker management
-- pg_net: HTTP requests from SQL (for pinging edge functions)
create extension if not exists pg_net;

-- supabase_vault: Secure credential storage (service role key, base URL)
create extension if not exists supabase_vault;

-- pg_cron: Scheduled job execution (ensure_workers cron)
create extension if not exists pg_cron;
