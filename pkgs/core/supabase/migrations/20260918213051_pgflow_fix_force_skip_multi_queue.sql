-- Modify "_assert_step_queue_available" function
CREATE OR REPLACE FUNCTION "pgflow"."_assert_step_queue_available" ("p_flow_slug" text, "p_queue_name" text) RETURNS boolean LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_owner_flow_slug text;
  v_listed text[];
begin
  -- A name derived or referenced by another concrete flow is rejected
  select s.flow_slug into v_owner_flow_slug
  from pgflow.steps as s
  where s.queue_name = p_queue_name
    and lower(s.flow_slug) <> lower(p_flow_slug)
  limit 1;

  if v_owner_flow_slug is null then
    select f.flow_slug into v_owner_flow_slug
    from pgflow.flows as f
    where f.queue_mode = 'flow'
      and lower(f.flow_slug) = p_queue_name
      and lower(f.flow_slug) <> lower(p_flow_slug)
    limit 1;
  end if;

  if v_owner_flow_slug is not null then
    raise exception
      'cannot create flow "%": queue "%" is already used by another flow ("%")',
      p_flow_slug, p_queue_name, v_owner_flow_slug
      using detail = 'Generated per-step queue names must belong to exactly one concrete flow.',
      hint = 'Use a different concrete flow slug, or drop the conflicting definition.';
  end if;

  -- Ambiguous normalized matches among listed queues are external damage
  select array_agg(listed.queue_name order by listed.queue_name)
  into v_listed
  from pgmq.list_queues() as listed
  where lower(listed.queue_name) = p_queue_name;

  if v_listed is not null and cardinality(v_listed) > 1 then
    raise exception
      'queue "%" matches multiple listed PGMQ queues (%)',
      p_queue_name, v_listed
      using detail = 'An ambiguous case-insensitive match is external damage.',
      hint = 'Resolve the duplicate queue spellings manually, then retry.';
  end if;

  -- Owned by an existing definition of this exact flow: reuse idempotently.
  -- A verified definition owns every derived route, so its one exact listed
  -- queue is allowed here. An owned route without its listed queue is
  -- external damage: reuse would report the route available while polling
  -- fails, so reject it instead.
  if exists (
    select 1 from pgflow.steps as s
    where s.flow_slug = p_flow_slug and s.queue_name = p_queue_name
  ) then
    if v_listed is null then
      raise exception
        'queue "%" owned by flow "%" is not listed in PGMQ',
        p_queue_name, p_flow_slug
        using detail = 'An owned route whose queue is missing may still hold outstanding task identities.',
        hint = 'Recreate the queue, or drop and recompile the flow definition.';
    end if;

    return false;
  end if;

  if v_listed is not null then
    raise exception
      'cannot create flow "%": queue "%" is already listed in PGMQ and not owned by this flow',
      p_flow_slug, p_queue_name
      using detail = 'A missing definition must not adopt an already listed queue.',
      hint = 'Drop the conflicting queue or use a different concrete flow slug.';
  end if;

  return true;
end;
$$;
-- Modify "_cascade_force_skip_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."_cascade_force_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_flow_slug text;
  v_total_skipped int := 0;
  v_archived_queues int;
BEGIN
  -- Get flow_slug for this run
  SELECT r.flow_slug INTO v_flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = _cascade_force_skip_steps.run_id;

  IF v_flow_slug IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', _cascade_force_skip_steps.run_id;
  END IF;

  -- ==========================================
  -- SKIP STEPS IN TOPOLOGICAL ORDER
  -- ==========================================
  -- Use recursive CTE to find all downstream dependents,
  -- then skip them in topological order (by step_index)
  WITH RECURSIVE
  -- ---------- Find all downstream steps ----------
  downstream_steps AS (
    -- Base case: the trigger step
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      _cascade_force_skip_steps.skip_reason AS reason  -- Original reason for trigger step
    FROM pgflow.steps s
    WHERE s.flow_slug = v_flow_slug
      AND s.step_slug = _cascade_force_skip_steps.step_slug

    UNION ALL

    -- Recursive case: steps that depend on already-found steps
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      'dependency_skipped'::text AS reason  -- Downstream steps get this reason
    FROM pgflow.steps s
    JOIN pgflow.deps d ON d.flow_slug = s.flow_slug AND d.step_slug = s.step_slug
    JOIN downstream_steps ds ON ds.flow_slug = d.flow_slug AND ds.step_slug = d.dep_slug
  ),
  -- ---------- Deduplicate and order by step_index ----------
  steps_to_skip AS (
    SELECT DISTINCT ON (ds.step_slug)
      ds.flow_slug,
      ds.step_slug,
      ds.step_index,
      ds.reason
    FROM downstream_steps ds
    ORDER BY ds.step_slug, ds.step_index  -- Keep first occurrence (trigger step has original reason)
  ),
  -- ---------- Skip the steps ----------
  skipped AS (
    UPDATE pgflow.step_states ss
    SET status = 'skipped',
        skip_reason = sts.reason,
        skipped_at = now(),
        remaining_tasks = NULL  -- Clear remaining_tasks for skipped steps
    FROM steps_to_skip sts
    WHERE ss.run_id = _cascade_force_skip_steps.run_id
      AND ss.step_slug = sts.step_slug
      AND ss.status IN ('created', 'started')  -- Only skip non-terminal steps
    RETURNING
      ss.*,
      -- Broadcast step:skipped event
      realtime.send(
        jsonb_build_object(
          'event_type', 'step:skipped',
          'run_id', ss.run_id,
          'flow_slug', ss.flow_slug,
          'step_slug', ss.step_slug,
          'status', 'skipped',
          'skip_reason', ss.skip_reason,
          'skipped_at', ss.skipped_at
        ),
        concat('step:', ss.step_slug, ':skipped'),
        concat('pgflow:run:', ss.run_id),
        false
      ) as _broadcast_result
  ),
  -- ---------- Terminalize active tasks of newly skipped steps ----------
  skipped_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'skipped'
    WHERE task.run_id = _cascade_force_skip_steps.run_id
      AND task.step_slug IN (
        SELECT skipped_step.step_slug
        FROM skipped AS skipped_step
      )
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id, task.queue_name
  ),
  -- ---------- Archive queued/started task messages for skipped steps ----------
  -- Batched per stored queue route (#650)
  archived_messages AS (
    SELECT pgmq.archive(
      task.queue_name,
      ARRAY_AGG(task.message_id)
    ) as result
    FROM skipped_tasks AS task
    WHERE task.message_id IS NOT NULL
    GROUP BY task.queue_name
    HAVING COUNT(task.message_id) > 0
  ),
  -- ---------- Update run counters ----------
  run_updates AS (
    UPDATE pgflow.runs r
    SET remaining_steps = r.remaining_steps - skipped_count.count
    FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
    WHERE r.run_id = _cascade_force_skip_steps.run_id
      AND skipped_count.count > 0
  )
  -- Consume every archived_messages row (COUNT(*)) in the same statement:
  -- SELECT INTO stops after its first row, and a direct LEFT JOIN of the
  -- CTE would leave every later queue's pgmq.archive group unevaluated, so
  -- its messages would recur indefinitely. The counted column lands in
  -- v_archived_queues the same way the other terminal cleanup functions
  -- force their archive CTE to run.
  SELECT skipped_count.count, archived_count.count
  INTO v_total_skipped, v_archived_queues
  FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
  LEFT JOIN (SELECT COUNT(*) AS count FROM archived_messages) archived_count ON true;

  RETURN v_total_skipped;
END;
$$;
