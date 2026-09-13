-- Resolve a stored canonical queue name to the spelling listed in pgmq.
--
-- pgflow stores canonical lowercase queue names (#650). A queue created by an
-- older pgflow release may be listed under its original mixed-case spelling;
-- public PGMQ operations need that original spelling. These helpers resolve
-- the listed spelling through pgmq.list_queues() and never create a second
-- metadata entry. An ambiguous case-insensitive match (external damage) is
-- rejected; an unlisted name is passed through unchanged so PGMQ reports the
-- operation's own error.
--
-- _listed_queue_name() resolves fresh on every call: destructive paths
-- (delete_flow_and_data) use it so a stale session memo cannot authorize
-- destructive work (#650).
--
-- Message operations resolve through _effective_queue_name(), which memoizes
-- successful resolutions for the lifetime of the database session (pooled
-- connections reuse them). Concurrent external renames of pgmq queues are
-- outside pgflow's supported boundary and can leave a stale session entry;
-- destructive paths reset their memo entries (delete_flow_and_data).

-- Fresh (uncached) resolution against pgmq.list_queues().
create or replace function pgflow._listed_queue_name(p_queue_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_matches text[];
begin
  -- Resolve every listed spelling of the normalized name before preferring
  -- any single match: an ambiguous pair is rejected even when one spelling
  -- is the exact requested name (#650).
  select array_agg(listed.queue_name order by listed.queue_name)
  into v_matches
  from pgmq.list_queues() as listed
  where lower(listed.queue_name) = lower(p_queue_name);

  if v_matches is null then
    -- Not listed: pass through; PGMQ reports its own error (or no-ops)
    return p_queue_name;
  elsif cardinality(v_matches) > 1 then
    raise exception
      'queue name "%" is ambiguous: it matches listed queues %',
      p_queue_name, v_matches
      using errcode = 'ambiguous_alias';
  else
    return v_matches[1];
  end if;
end;
$$;

-- Memoizing wrapper used by message operations.
create or replace function pgflow._effective_queue_name(p_queue_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cached text;
  v_result text;
begin
  v_cached := current_setting('pgflow.queue_name.' || p_queue_name, true);
  if v_cached is not null then
    return v_cached;
  end if;

  v_result := pgflow._listed_queue_name(p_queue_name);

  perform set_config('pgflow.queue_name.' || p_queue_name, v_result, false);
  return v_result;
end;
$$;
