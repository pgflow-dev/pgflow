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
