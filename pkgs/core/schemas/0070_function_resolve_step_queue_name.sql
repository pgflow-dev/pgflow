-- Canonical per-step queue-name resolution (#651).
--
-- For a zero-based step index:
--   readable = lower(flow_slug || '__' || step_slug)
--   fallback = lower(flow_slug || '__' || step_index)
--
-- Resolution: readable when it fits MAX 47 characters; otherwise the
-- actual-index fallback when it fits; otherwise the complete flow is
-- rejected. Names are never truncated or hashed. TypeScript mirrors this
-- resolver in @pgflow/dsl (resolveStepQueueName); vectors must stay in sync.
create or replace function pgflow._resolve_step_queue_name(
  p_flow_slug text,
  p_step_slug text,
  p_step_index int
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_readable text := lower(p_flow_slug || '__' || p_step_slug);
  v_fallback text := lower(p_flow_slug || '__' || p_step_index);
  v_shortest text := lower(p_flow_slug || '__0');
begin
  if length(v_readable) <= 47 then
    return v_readable;
  end if;

  if length(v_shortest) > 47 then
    -- The flow slug cannot fit even the shortest possible index suffix.
    raise exception
      'Flow "%" cannot use per-step queues.',
      p_flow_slug
      using detail = format(
        'The shortest required queue "%s" is %s characters; PGMQ allows at most 47.',
        v_shortest, length(v_shortest)
      ),
      hint = 'Shorten the concrete flow slug or use the default single queue.';
  end if;

  if length(v_fallback) <= 47 then
    return v_fallback;
  end if;

  raise exception
    'Cannot derive a queue for step "%" at index % in flow "%".',
    p_step_slug, p_step_index, p_flow_slug
    using detail = format(
      'The readable name is %s characters and the index fallback is %s; PGMQ allows at most 47.',
      length(v_readable), length(v_fallback)
    ),
    hint = 'Shorten the concrete flow slug, shorten the step slug enough for the readable name, or use the default single queue.';
end;
$$;
