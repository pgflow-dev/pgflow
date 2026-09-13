-- Utility functions that don't depend on other entities

-- Detects if running in local Supabase CLI environment
-- by checking if JWT secret matches the known hardcoded local value.
-- Returns true only for exact match; defaults to false (production-safe).
create or replace function pgflow.is_local()
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    current_setting('app.settings.jwt_secret', true)
      = 'super-secret-jwt-token-with-at-least-32-characters-long',
    false
  )
$$;

create or replace function pgflow.is_valid_slug(
  slug text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
    return
      slug is not null
      and slug <> ''
      and length(slug) <= 128
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
      and slug NOT IN ('run'); -- reserved words
end;
$$;

create or replace function pgflow.is_valid_queue_name(
  queue_name text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Mirrors pgmq.validate_queue_name() (47-character limit) and additionally
  -- requires the canonical lowercase spelling pgflow stores (#650).
  select
    queue_name is not null
    and queue_name <> ''
    and length(queue_name) <= 47
    and queue_name = lower(queue_name)
$$;

create or replace function pgflow.calculate_retry_delay(
  base_delay numeric,
  attempts_count int
)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select floor(base_delay * power(2, attempts_count))::int
$$;
