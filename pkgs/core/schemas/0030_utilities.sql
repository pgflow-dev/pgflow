-- Utility functions that don't depend on other entities

create or replace function pgflow.is_valid_slug(
  slug text
)
returns boolean
language plpgsql
immutable
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

create or replace function pgflow.calculate_retry_delay(
  base_delay numeric,
  attempts_count int
)
returns int
language sql
immutable
parallel safe
as $$
  select floor(base_delay * power(2, attempts_count))::int
$$;

-- Helper function to raise exceptions in SQL contexts
create or replace function pgflow.raise_exception(message text)
returns void as $$
begin
  raise exception '%', message;
end;
$$ language plpgsql;
