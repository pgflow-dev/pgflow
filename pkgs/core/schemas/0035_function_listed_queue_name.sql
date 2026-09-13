-- Resolve a stored canonical queue name to the spelling listed in pgmq.
--
-- pgflow stores canonical lowercase queue names (#650). A queue created by an
-- older pgflow release may be listed under its original mixed-case spelling.
-- PGMQ's public message operations (send_batch, read_with_poll, set_vt,
-- archive, delete) normalize names themselves, so message paths address the
-- queue by its stored canonical name directly and never resolve anything.
--
-- Only operations that must address the queue's physical objects by their
-- original spelling need this helper today: delete_flow_and_data (drop_queue
-- drops metadata and tables under the listed spelling). The helper resolves
-- the listed spelling through pgmq.list_queues() and never creates a second
-- metadata entry. An ambiguous case-insensitive match (external damage) is
-- rejected before any destructive work; an unlisted name is passed through
-- unchanged so PGMQ reports the operation's own error.

-- Fresh resolution against pgmq.list_queues().
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
