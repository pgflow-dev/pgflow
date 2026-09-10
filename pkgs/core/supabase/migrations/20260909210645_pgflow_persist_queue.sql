-- The Supabase migration runner does not wrap files in a transaction, so this
-- migration wraps its own body (plan Task 9: prove both runners). The offline
-- upgrade fixture applies this file WITHOUT --single-transaction for the same
-- reason. SET LOCAL/LOCK TABLE below require this wrapper.
BEGIN;
-- Migration-only locked preflight (#650). Hand-authored per the approved plan;
-- Atlas cannot infer this section. Rejects every audit category atomically
-- before any structural change. Offline writer fence is assumed outside.
SET LOCAL lock_timeout = '5s';
LOCK TABLE pgflow.flows IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.steps IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.deps IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.runs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.step_states IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.step_tasks IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.workers IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgflow.worker_functions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pgmq.meta IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
declare
  v_queue text;
  v_meta_count int;
  v_metadata_name text;
  v_qtable text;
  v_atable text;
  v_seq text;
  v_detail text;
  v_count bigint;
begin
  -- Lock each validated candidate's physical objects in canonical queue
  -- order (q then a) and recheck metadata resolution under those locks.
  for v_queue in select distinct lower(f.flow_slug) as q from pgflow.flows f order by 1
  loop
    if length(v_queue) > 47 or v_queue !~ '^[a-z][a-z0-9_]*$' then
      raise exception 'Migration preflight: canonical queue name "%" is not a valid generated queue name (lowercase, at most 47 characters, starting with a letter); rename this flow manually before upgrade', v_queue;
    end if;

    select count(*), min(m.queue_name) into v_meta_count, v_metadata_name
    from pgmq.meta m
    where lower(m.queue_name) = v_queue;
    if v_meta_count <> 1 then
      raise exception 'Migration preflight: canonical queue "%" has % pgmq metadata rows (expected exactly one); resolve exact metadata spelling manually before upgrade', v_queue, v_meta_count;
    end if;

    v_qtable := pgmq.format_table_name(v_queue, 'q');
    v_atable := pgmq.format_table_name(v_queue, 'a');
    v_seq := v_qtable || '_msg_id_seq';
    if to_regclass('pgmq.' || v_qtable) is null
       or to_regclass('pgmq.' || v_atable) is null
       or to_regclass('pgmq.' || v_seq) is null then
      raise exception 'Migration preflight: queue "%" (metadata "%") is missing physical q/a/sequence objects; the migration neither reconstructs nor drops resources', v_queue, v_metadata_name;
    end if;

    execute format('lock table pgmq.%I, pgmq.%I in access exclusive mode', v_qtable, v_atable);
  end loop;

  -- New slug rules (leading/trailing underscore, double underscore) on every
  -- existing definition; the stricter is_valid_slug does not revalidate rows.
  for v_detail in
    select 'flow "' || f.flow_slug || '": leading underscore not allowed'
    from pgflow.flows f where left(f.flow_slug, 1) = '_'
    union all
    select 'flow "' || f.flow_slug || '": trailing underscore not allowed'
    from pgflow.flows f where right(f.flow_slug, 1) = '_'
    union all
    select 'flow "' || f.flow_slug || '": double underscore not allowed'
    from pgflow.flows f where position('__' in f.flow_slug) > 0
    union all
    select 'flow "' || s.flow_slug || '" step "' || s.step_slug || '": leading underscore not allowed'
    from pgflow.steps s where left(s.step_slug, 1) = '_'
    union all
    select 'flow "' || s.flow_slug || '" step "' || s.step_slug || '": trailing underscore not allowed'
    from pgflow.steps s where right(s.step_slug, 1) = '_'
    union all
    select 'flow "' || s.flow_slug || '" step "' || s.step_slug || '": double underscore not allowed'
    from pgflow.steps s where position('__' in s.step_slug) > 0
  loop
    raise exception 'Migration preflight: incompatible definition %; resolve the exact name manually before upgrade (no automatic rename)', v_detail;
  end loop;

  -- Case-only aliases share a canonical queue and are rejected atomically.
  select string_agg(f.flow_slug, ', ' order by f.flow_slug) into v_detail
  from pgflow.flows f
  group by lower(f.flow_slug)
  having count(*) > 1;
  if v_detail is not null then
    raise exception 'Migration preflight: case-only flow alias group [%] shares one canonical queue; resolve exact spelling manually (no automatic rename)', v_detail;
  end if;

  select string_agg(s.flow_slug || '/' || s.step_slug, ', ' order by s.flow_slug, s.step_slug) into v_detail
  from pgflow.steps s
  group by s.flow_slug, lower(s.step_slug)
  having count(*) > 1;
  if v_detail is not null then
    raise exception 'Migration preflight: case-only step alias group [%]; resolve exact spelling manually (no automatic rename)', v_detail;
  end if;

  -- Prospective duplicate (queue, message) pairs; backfill must not collide.
  select string_agg(lower(t.flow_slug) || '#' || t.message_id::text, ', ') into v_detail
  from pgflow.step_tasks t
  where t.message_id is not null
  group by lower(t.flow_slug), t.message_id
  having count(*) > 1;
  if v_detail is not null then
    raise exception 'Migration preflight: distinct old tasks share a prospective queue/message pair [%]; resolve manually (no automatic merge)', v_detail;
  end if;

  -- Denormalized runtime ownership must be consistent before backfill.
  select count(*) into v_count
  from pgflow.step_tasks t
  join pgflow.runs r on r.run_id = t.run_id
  where r.flow_slug is distinct from t.flow_slug;
  if v_count > 0 then
    raise exception 'Migration preflight: % step_tasks rows disagree with their run''s flow_slug; resolve denormalized ownership manually', v_count;
  end if;

  -- Active queue rows without an exact durable task identity, including
  -- non-visible messages (vt > now() does not exempt them).
  for v_queue in select distinct lower(f.flow_slug) as q from pgflow.flows f order by 1
  loop
    v_qtable := pgmq.format_table_name(v_queue, 'q');
    execute format(
      'select count(*) from pgmq.%I q
       where not exists (
         select 1 from pgflow.step_tasks t
         where lower(t.flow_slug) = $1 and t.message_id = q.msg_id
       )', v_qtable)
    into v_count using v_queue;
    if v_count > 0 then
      raise exception 'Migration preflight: queue "%" holds % active message(s) without a matching exact task identity; resolve orphan messages manually before upgrade', v_queue, v_count;
    end if;
  end loop;
end
$preflight$;

-- Create index "idx_flows_slug_lower" to table: "flows"
CREATE UNIQUE INDEX "idx_flows_slug_lower" ON "pgflow"."flows" ((lower(flow_slug)));
-- Create "_is_valid_queue_name" function
CREATE FUNCTION "pgflow"."_is_valid_queue_name" ("queue_name" text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET "search_path" = '' AS $$
select
    queue_name is not null
    and queue_name <> ''
    and length(queue_name) <= 47
    and queue_name ~ '^[a-z][a-z0-9_]*$'
$$;
-- Drop index "idx_step_tasks_message_id" from table: "step_tasks"
DROP INDEX "pgflow"."idx_step_tasks_message_id";
-- Drop index "idx_step_tasks_queued_msg" from table: "step_tasks"
DROP INDEX "pgflow"."idx_step_tasks_queued_msg";
-- Migration-only backfill (#650): between nullable column addition and
-- enforcement, exactly as approved in the plan. The immutability trigger
-- below intentionally does not exist yet during this UPDATE.
ALTER TABLE "pgflow"."step_tasks" ADD COLUMN "queue_name" text;
ALTER TABLE "pgflow"."steps" ADD COLUMN "queue_name" text;
UPDATE pgflow.steps SET queue_name = lower(flow_slug);
UPDATE pgflow.step_tasks SET queue_name = lower(flow_slug);
ALTER TABLE "pgflow"."step_tasks" ALTER COLUMN "queue_name" SET NOT NULL;
ALTER TABLE "pgflow"."steps" ALTER COLUMN "queue_name" SET NOT NULL;
ALTER TABLE "pgflow"."step_tasks" ADD CONSTRAINT "queue_name_is_valid" CHECK (pgflow._is_valid_queue_name(queue_name));
ALTER TABLE "pgflow"."steps" ADD CONSTRAINT "queue_name_is_valid" CHECK (pgflow._is_valid_queue_name(queue_name));
-- Create index "idx_step_tasks_queue_message" to table: "step_tasks"
CREATE UNIQUE INDEX "idx_step_tasks_queue_message" ON "pgflow"."step_tasks" ("queue_name", "message_id") WHERE (message_id IS NOT NULL);
-- Create "_keep_task_queue_name" function
CREATE FUNCTION "pgflow"."_keep_task_queue_name" () RETURNS trigger LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
  if exists (
    select run_id, step_slug, task_index, queue_name from old_tasks
    except
    select run_id, step_slug, task_index, queue_name from new_tasks
  ) then
    raise exception 'step_tasks.queue_name is immutable';
  end if;
  return null;
end;
$$;
-- Create trigger "keep_task_queue_name"
CREATE TRIGGER "keep_task_queue_name" AFTER UPDATE ON "pgflow"."step_tasks" REFERENCING OLD TABLE AS "old_tasks" NEW TABLE AS "new_tasks" FOR EACH STATEMENT EXECUTE FUNCTION "pgflow"."_keep_task_queue_name"();
-- Create index "idx_steps_slug_lower" to table: "steps"
CREATE UNIQUE INDEX "idx_steps_slug_lower" ON "pgflow"."steps" ("flow_slug", (lower(step_slug)));
-- Modify "_archive_task_message" function
CREATE OR REPLACE FUNCTION "pgflow"."_archive_task_message" ("p_run_id" uuid, "p_step_slug" text, "p_task_index" integer) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_batch record;
begin
  PERFORM 1 FROM pgflow.runs r
  WHERE r.run_id = p_run_id
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_states ss
  WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug
  FOR UPDATE;

  FOR v_batch IN
    WITH locked_tasks AS (
      SELECT task.queue_name, task.message_id
      FROM pgflow.step_tasks task
      WHERE task.run_id = p_run_id
        AND task.step_slug = p_step_slug
        AND task.task_index = p_task_index
        AND task.message_id IS NOT NULL
      ORDER BY task.task_index
      FOR UPDATE
    )
    SELECT
      lt.queue_name,
      ARRAY_AGG(lt.message_id ORDER BY lt.message_id) AS ids
    FROM locked_tasks lt
    GROUP BY lt.queue_name
  LOOP
    PERFORM pgmq.archive(v_batch.queue_name, v_batch.ids);
  END LOOP;
END;
$$;
-- Modify "_cascade_force_skip_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."_cascade_force_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_flow_slug text;
  v_total_skipped int := 0;
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
    RETURNING task.queue_name, task.message_id
  ),
  -- ---------- Archive queued/started task messages for skipped steps ----------
  -- Grouped by the task's queue snapshot; only newly skipped steps' tasks are
  -- archived (preexisting skipped steps were already archived) (#650)
  archived_messages AS (
    SELECT pgmq.archive(st.queue_name, ARRAY_AGG(st.message_id)) as result
    FROM skipped_tasks AS st
    WHERE st.message_id IS NOT NULL
    GROUP BY st.queue_name
    HAVING COUNT(st.message_id) > 0
  ),
  -- ---------- Update run counters ----------
  run_updates AS (
    UPDATE pgflow.runs r
    SET remaining_steps = r.remaining_steps - skipped_count.count
    FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
    WHERE r.run_id = _cascade_force_skip_steps.run_id
      AND skipped_count.count > 0
  )
  SELECT skipped_count.count
  INTO v_total_skipped
  FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
  LEFT JOIN archived_messages ON true;

  RETURN v_total_skipped;
END;
$$;
-- Create "_inspect_generated_queue" function
CREATE FUNCTION "pgflow"."_inspect_generated_queue" ("p_flow_slug" text, "p_queue_name" text, "p_require_existing" boolean) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_canonical_queue text := lower(p_flow_slug);
  v_qtable text;
  v_atable text;
  v_sequence text;
  v_meta_count int;
  v_metadata_name text;
  v_meta_row pgmq.meta%ROWTYPE;
  v_flow_exists boolean;
  v_other_flow text;
  v_q_oid oid;
  v_a_oid oid;
  v_seq_oid oid;
  v_bad text;
begin
  if not pgflow._is_valid_queue_name(p_queue_name) then
    raise exception 'Flow %: "%" is not a valid generated queue name (lowercase, at most 47 characters, starting with a letter)',
      p_flow_slug, p_queue_name;
  end if;

  if p_queue_name <> v_canonical_queue then
    raise exception 'Flow %: queue "%" is not its canonical generated route "%" (custom routes do not exist in #650)',
      p_flow_slug, p_queue_name, v_canonical_queue;
  end if;

  select exists(select 1 from pgflow.flows f where f.flow_slug = p_flow_slug)
    into v_flow_exists;

  -- Topology fence: serialize against external PGMQ create/drop on this
  -- namespace (PGMQ 1.5.1 inserts metadata only after creating objects). All
  -- ownership checks and physical inspection happen after the fence so a
  -- wait cannot invalidate them.
  lock table pgmq.meta in share row exclusive mode;

  -- Ownership evidence: no other flow may derive, persist, or reference this route
  select f.flow_slug into v_other_flow
  from pgflow.flows f
  where lower(f.flow_slug) = p_queue_name
    and f.flow_slug <> p_flow_slug
  limit 1;
  if v_other_flow is not null then
    raise exception 'Generated queue "%" for flow % collides with the derived route of flow %',
      p_queue_name, p_flow_slug, v_other_flow;
  end if;

  select s.flow_slug into v_other_flow
  from pgflow.steps s
  where s.queue_name = p_queue_name
    and s.flow_slug <> p_flow_slug
  limit 1;
  if v_other_flow is not null then
    raise exception 'Generated queue "%" for flow % is persisted as a route of flow %',
      p_queue_name, p_flow_slug, v_other_flow;
  end if;

  select t.flow_slug into v_other_flow
  from pgflow.step_tasks t
  where t.queue_name = p_queue_name
    and t.flow_slug <> p_flow_slug
  limit 1;
  if v_other_flow is not null then
    raise exception 'Generated queue "%" for flow % is referenced by tasks of flow %',
      p_queue_name, p_flow_slug, v_other_flow;
  end if;

  select count(*), min(m.queue_name) into v_meta_count, v_metadata_name
  from pgmq.meta as m
  where lower(m.queue_name) = p_queue_name;

  if v_meta_count > 1 then
    raise exception 'Generated queue "%" for flow % has ambiguous PGMQ metadata (% rows share the name case-insensitively)',
      p_queue_name, p_flow_slug, v_meta_count;
  end if;

  v_qtable := pgmq.format_table_name(p_queue_name, 'q');
  v_atable := pgmq.format_table_name(p_queue_name, 'a');
  v_sequence := v_qtable || '_msg_id_seq';

  v_q_oid := to_regclass(format('pgmq.%I', v_qtable));
  v_a_oid := to_regclass(format('pgmq.%I', v_atable));
  v_seq_oid := to_regclass(format('pgmq.%I', v_sequence));

  if v_meta_count = 0 and v_q_oid is null and v_a_oid is null and v_seq_oid is null then
    -- Only genuinely absent when zero metadata AND zero objects
    if p_require_existing then
      raise exception 'Flow %: generated queue "%" is missing (no PGMQ metadata, no objects)',
        p_flow_slug, p_queue_name;
    end if;
    return jsonb_build_object('state', 'absent');
  end if;

  -- Some metadata or physical evidence exists: the concrete definition must
  -- own it. A missing definition plus any resource is a collision.
  if not v_flow_exists then
    raise exception 'Generated queue "%" exists (metadata: %, queue table: %, archive table: %, sequence: %) but flow % has no definition; refusing to adopt external resources',
      p_queue_name, v_meta_count, v_qtable, v_atable, v_sequence, p_flow_slug;
  end if;

  if v_meta_count = 0 then
    raise exception 'Flow %: generated queue "%" has physical objects without PGMQ metadata (queue table: %, archive table: %, sequence: %)',
      p_flow_slug, p_queue_name, v_qtable, v_atable, v_sequence;
  end if;

  if v_q_oid is null or v_a_oid is null or v_seq_oid is null then
    raise exception 'Flow %: generated queue "%" has incomplete PGMQ objects (queue table: %, archive table: %, sequence: %)',
      p_flow_slug, p_queue_name, v_qtable, v_atable, v_sequence;
  end if;

  select * into v_meta_row from pgmq.meta m where lower(m.queue_name) = p_queue_name;

  -- ==========================================
  -- QUEUE TABLE CONTRACT
  -- ==========================================
  select reason into v_bad from (
    select 'queue table %s is not an ordinary permanent table' as reason
    from pg_class c
    where c.oid = v_q_oid
      and (c.relkind <> 'r' or c.relpersistence <> 'p')
    union all
    select 'queue table %s: msg_id must be a non-null bigint generated-always identity primary key'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'msg_id'
      and (a.atttypid <> 'int8'::regtype or not a.attnotnull or a.attidentity <> 'a')
    union all
    select 'queue table %s: missing msg_id bigint identity column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'msg_id' and a.attnum > 0)
    union all
    select 'queue table %s: msg_id has no primary key'
    where not exists (
      select 1 from pg_index i
      where i.indrelid = v_q_oid and i.indisprimary
        and i.indkey[0] = (select a.attnum from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'msg_id')
    )
    union all
    select 'queue table %s: read_ct must be a non-null integer'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'read_ct'
      and (a.atttypid <> 'int4'::regtype or not a.attnotnull)
    union all
    select 'queue table %s: missing read_ct column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'read_ct' and a.attnum > 0)
    union all
    select 'queue table %s: enqueued_at must be a non-null timestamptz'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'enqueued_at'
      and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
    union all
    select 'queue table %s: missing enqueued_at column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'enqueued_at' and a.attnum > 0)
    union all
    select 'queue table %s: vt must be a non-null timestamptz'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'vt'
      and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
    union all
    select 'queue table %s: missing vt column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'vt' and a.attnum > 0)
    union all
    select 'queue table %s: message must be jsonb'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'message'
      and a.atttypid <> 'jsonb'::regtype
    union all
    select 'queue table %s: missing message column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'message' and a.attnum > 0)
    union all
    select 'queue table %s: headers must be jsonb'
    from pg_attribute a
    where a.attrelid = v_q_oid and a.attname = 'headers'
      and a.atttypid <> 'jsonb'::regtype
    union all
    select 'queue table %s: missing headers column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_q_oid and a.attname = 'headers' and a.attnum > 0)
    union all
    select 'queue table %s has no valid index on vt'
    where not exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      where i.indrelid = v_q_oid and i.indisvalid and a.attname = 'vt'
    )
    union all
    select 'queue table %s metadata flags disagree with physical shape (partitioned/unlogged)'
    where v_meta_row.is_partitioned or v_meta_row.is_unlogged
  ) problems
  limit 1;

  if v_bad is not null then
    raise exception 'Flow %: generated queue "%" failed physical inspection: %',
      p_flow_slug, p_queue_name, format(v_bad, v_qtable);
  end if;

  -- ==========================================
  -- ARCHIVE TABLE CONTRACT
  -- ==========================================
  select reason into v_bad from (
    select 'archive table %s is not an ordinary permanent table' as reason
    from pg_class c
    where c.oid = v_a_oid
      and (c.relkind <> 'r' or c.relpersistence <> 'p')
    union all
    select 'archive table %s: msg_id must be a non-null bigint primary key without identity generator'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'msg_id'
      and (a.atttypid <> 'int8'::regtype or not a.attnotnull or a.attidentity <> '')
    union all
    select 'archive table %s: missing msg_id bigint column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'msg_id' and a.attnum > 0)
    union all
    select 'archive table %s: msg_id has no primary key'
    where not exists (
      select 1 from pg_index i
      where i.indrelid = v_a_oid and i.indisprimary
        and i.indkey[0] = (select a.attnum from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'msg_id')
    )
    union all
    select 'archive table %s: read_ct must be a non-null integer'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'read_ct'
      and (a.atttypid <> 'int4'::regtype or not a.attnotnull)
    union all
    select 'archive table %s: missing read_ct column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'read_ct' and a.attnum > 0)
    union all
    select 'archive table %s: enqueued_at must be a non-null timestamptz'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'enqueued_at'
      and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
    union all
    select 'archive table %s: missing enqueued_at column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'enqueued_at' and a.attnum > 0)
    union all
    select 'archive table %s: archived_at must be a non-null timestamptz'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'archived_at'
      and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
    union all
    select 'archive table %s: missing archived_at column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'archived_at' and a.attnum > 0)
    union all
    select 'archive table %s: vt must be a non-null timestamptz'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'vt'
      and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
    union all
    select 'archive table %s: missing vt column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'vt' and a.attnum > 0)
    union all
    select 'archive table %s: message must be jsonb'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'message'
      and a.atttypid <> 'jsonb'::regtype
    union all
    select 'archive table %s: missing message column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'message' and a.attnum > 0)
    union all
    select 'archive table %s: headers must be jsonb'
    from pg_attribute a
    where a.attrelid = v_a_oid and a.attname = 'headers'
      and a.atttypid <> 'jsonb'::regtype
    union all
    select 'archive table %s: missing headers column'
    where not exists (select 1 from pg_attribute a where a.attrelid = v_a_oid and a.attname = 'headers' and a.attnum > 0)
    union all
    select 'archive table %s has no valid index on archived_at'
    where not exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      where i.indrelid = v_a_oid and i.indisvalid and a.attname = 'archived_at'
    )
  ) problems
  limit 1;

  if v_bad is not null then
    raise exception 'Flow %: generated queue "%" failed physical inspection: %',
      p_flow_slug, p_queue_name, format(v_bad, v_atable);
  end if;

  -- ==========================================
  -- SEQUENCE CONTRACT
  -- ==========================================
  select reason into v_bad from (
    select 'sequence %s must be a bigint sequence' as reason
    from pg_sequence s
    where s.seqrelid = v_seq_oid
      and s.seqtypid <> 'int8'::regtype
    union all
    select 'sequence %s is missing'
    where not exists (select 1 from pg_sequence s where s.seqrelid = v_seq_oid)
    union all
    select 'sequence %s is not associated with queue msg_id'
    where not exists (
      select 1
      from pg_depend d
      join pg_attribute a
        on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      where d.objid = v_seq_oid
        and d.refobjid = v_q_oid
        and a.attname = 'msg_id'
        and d.deptype in ('i', 'a')
    )
  ) problems
  limit 1;

  if v_bad is not null then
    raise exception 'Flow %: generated queue "%" failed physical inspection: %',
      p_flow_slug, p_queue_name, format(v_bad, v_sequence);
  end if;

  return jsonb_build_object('state', 'present', 'metadata_name', v_metadata_name);
end;
$$;
-- Modify "is_valid_slug" function
CREATE OR REPLACE FUNCTION "pgflow"."is_valid_slug" ("slug" text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET "search_path" = '' AS $$
begin
    return
      slug is not null
      and slug <> ''
      and length(slug) <= 128
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
      and left(slug, 1) <> '_'
      and right(slug, 1) <> '_'
      and position('__' in slug) = 0
      and slug NOT IN ('run'); -- reserved words
end;
$$;
-- Create "_ensure_generated_queue" function
CREATE FUNCTION "pgflow"."_ensure_generated_queue" ("p_flow_slug" text, "p_queue_name" text) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_state jsonb;
begin
  perform pg_advisory_xact_lock(1, hashtext(lower(p_flow_slug)));

  if not exists (select 1 from pgflow.flows f where f.flow_slug = p_flow_slug for update) then
    raise exception 'Flow % does not exist; cannot provision generated queue "%"',
      p_flow_slug, p_queue_name;
  end if;

  v_state := pgflow._inspect_generated_queue(p_flow_slug, p_queue_name, false);

  if v_state ->> 'state' = 'absent' then
    -- A live definition or task snapshot that still references this route
    -- means the physical queue was lost; recreating it would hide that loss.
    if exists (
      select 1
      from pgflow.steps s
      where s.flow_slug = p_flow_slug and s.queue_name = p_queue_name
    ) or exists (
      select 1
      from pgflow.step_tasks t
      where t.flow_slug = p_flow_slug and t.queue_name = p_queue_name
    ) then
      raise exception 'Flow %: generated queue "%" is absent but existing steps/tasks reference it; refusing to reconstruct a lost live queue',
        p_flow_slug, p_queue_name;
    end if;

    perform pgmq.create(p_queue_name);
  end if;

  -- Post-create verification under the same fence and locks.
  perform pgflow._inspect_generated_queue(p_flow_slug, p_queue_name, true);
end;
$$;
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[] DEFAULT '{}', "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single', "required_input_pattern" jsonb DEFAULT NULL::jsonb, "forbidden_input_pattern" jsonb DEFAULT NULL::jsonb, "when_unmet" text DEFAULT 'skip', "when_exhausted" text DEFAULT 'fail', "queue_name" text DEFAULT NULL::text) RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  result_step pgflow.steps;
  next_idx int;
  v_queue_name text;
  v_alias_slug text;
BEGIN
  -- Canonical flow lock shared with compilation and deletion
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(add_step.flow_slug)));

  -- Lock the exact concrete flow row before calculating the next step index
  IF NOT EXISTS (
    SELECT 1 FROM pgflow.flows f
    WHERE f.flow_slug = add_step.flow_slug
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Flow % does not exist', add_step.flow_slug;
  END IF;

  -- Resolve the route: omitted defaults to the canonical generated queue;
  -- an explicit equal canonical route is accepted, a different route is not.
  v_queue_name := COALESCE(add_step.queue_name, lower(add_step.flow_slug));
  IF add_step.queue_name IS NOT NULL AND add_step.queue_name <> lower(add_step.flow_slug) THEN
    RAISE EXCEPTION 'Flow %: step "%" cannot use queue "%" (custom routes do not exist in #650; the canonical route is "%")',
      add_step.flow_slug, add_step.step_slug, add_step.queue_name, lower(add_step.flow_slug);
  END IF;

  -- Validate the step slug and map constraints before any provisioning
  IF NOT pgflow.is_valid_slug(add_step.step_slug) THEN
    RAISE EXCEPTION 'Flow %: "%" is not a valid step slug', add_step.flow_slug, add_step.step_slug;
  END IF;

  IF COALESCE(add_step.step_type, 'single') = 'map' AND COALESCE(array_length(add_step.deps_slugs, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Map step "%" can have at most one dependency, but % were provided: %',
      add_step.step_slug,
      COALESCE(array_length(add_step.deps_slugs, 1), 0),
      array_to_string(add_step.deps_slugs, ', ');
  END IF;

  -- Dependencies must reference existing steps of this exact flow
  PERFORM 1
  FROM unnest(COALESCE(add_step.deps_slugs, '{}')) AS d(dep_slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM pgflow.steps s
    WHERE s.flow_slug = add_step.flow_slug
      AND s.step_slug = d.dep_slug
  );
  IF FOUND THEN
    RAISE EXCEPTION 'Flow %: step "%" has a dependency that does not exist', add_step.flow_slug, add_step.step_slug;
  END IF;

  -- Case-alias precheck before the unique index; names both spellings
  SELECT s.step_slug INTO v_alias_slug
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug
    AND lower(s.step_slug) = lower(add_step.step_slug)
    AND s.step_slug <> add_step.step_slug
  LIMIT 1;
  IF v_alias_slug IS NOT NULL THEN
    RAISE SQLSTATE '23505' USING MESSAGE = format(
      'Flow %s: step "%s" conflicts with existing step "%s" (case-insensitive step namespace)',
      add_step.flow_slug, add_step.step_slug, v_alias_slug
    );
  END IF;

  -- Provision/verify the generated queue through the shared ownership path
  PERFORM pgflow._ensure_generated_queue(add_step.flow_slug, v_queue_name);

  -- Get next step index (under the flow row lock)
  SELECT COALESCE(MAX(s.step_index) + 1, 0) INTO next_idx
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug;

  -- Create the step with its resolved route snapshot
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, step_type, step_index, deps_count, queue_name,
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
    required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted
  )
  VALUES (
    add_step.flow_slug,
    add_step.step_slug,
    COALESCE(add_step.step_type, 'single'),
    next_idx,
    COALESCE(array_length(add_step.deps_slugs, 1), 0),
    v_queue_name,
    add_step.max_attempts,
    add_step.base_delay,
    add_step.timeout,
    add_step.start_delay,
    add_step.required_input_pattern,
    add_step.forbidden_input_pattern,
    add_step.when_unmet,
    add_step.when_exhausted
  )
  ON CONFLICT ON CONSTRAINT steps_pkey
  DO UPDATE SET step_slug = EXCLUDED.step_slug
  RETURNING * INTO result_step;

  -- Insert dependencies
  INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
  SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
  FROM unnest(COALESCE(add_step.deps_slugs, '{}')) AS d(dep_slug)
  WHERE add_step.deps_slugs IS NOT NULL AND array_length(add_step.deps_slugs, 1) > 0
  ON CONFLICT ON CONSTRAINT deps_pkey DO NOTHING;

  RETURN result_step;
END;
$$;
-- Modify "create_flow" function
CREATE OR REPLACE FUNCTION "pgflow"."create_flow" ("flow_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."flows" LANGUAGE plpgsql SET "search_path" = '' AS $$
#variable_conflict use_column
declare
  result_flow pgflow.flows;
  v_alias_slug text;
begin
  -- Canonical advisory lock: case aliases share the lock so concurrent
  -- compilation cannot create both spellings.
  perform pg_advisory_xact_lock(1, hashtext(lower(create_flow.flow_slug)));

  -- Precheck case aliases before the unique index does; the message names
  -- both exact spellings.
  select f.flow_slug into v_alias_slug
  from pgflow.flows f
  where lower(f.flow_slug) = lower(create_flow.flow_slug)
    and f.flow_slug <> create_flow.flow_slug
  limit 1;

  if v_alias_slug is not null then
    raise sqlstate '23505' using message = format(
      'Flow "%s" conflicts with existing flow "%s" (case-insensitive flow namespace)',
      create_flow.flow_slug, v_alias_slug
    );
  end if;

  if not exists (select 1 from pgflow.flows f where f.flow_slug = create_flow.flow_slug) then
    -- New identity: the canonical generated route must be genuinely absent so
    -- create_flow cannot launder an external queue into apparent ownership
    -- before add_step() runs. The inspection takes the pgmq.meta fence.
    perform pgflow._inspect_generated_queue(
      create_flow.flow_slug,
      lower(create_flow.flow_slug),
      false
    );
  end if;

  insert into pgflow.flows as flow (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
  values (
    create_flow.flow_slug,
    coalesce(max_attempts, 3),
    coalesce(base_delay, 5),
    coalesce(timeout, 60)
  )
  on conflict (flow_slug) do update
  set flow_slug = flow.flow_slug -- Dummy update: idempotent
  returning * into result_flow;

  return result_flow;
end;
$$;
-- Create "_validate_flow_shape" function
CREATE FUNCTION "pgflow"."_validate_flow_shape" ("p_flow_slug" text, "p_shape" jsonb) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step jsonb;
  v_step_slug text;
  v_dep text;
  v_canonical_queue text := lower(p_flow_slug);
  v_conflict text;
begin
  if not pgflow.is_valid_slug(p_flow_slug) then
    raise exception 'Flow "%" is not a valid flow slug', p_flow_slug;
  end if;

  if jsonb_typeof(p_shape) is distinct from 'object'
     or jsonb_typeof(p_shape->'steps') is distinct from 'array' then
    raise exception 'Flow % requires a complete steps array', p_flow_slug;
  end if;

  -- Resolve all required canonical queue names before mutation: in #650 the
  -- complete required route is exactly the canonical default.
  if not pgflow._is_valid_queue_name(v_canonical_queue) then
    raise exception 'Flow % resolves to generated queue name "%" longer than the 47-character compatibility limit or otherwise invalid',
      p_flow_slug, v_canonical_queue;
  end if;

  -- Every step name satisfies the shared slug rules
  for v_step in select * from jsonb_array_elements(p_shape->'steps') loop
    v_step_slug := v_step->>'slug';

    if not pgflow.is_valid_slug(v_step_slug) then
      raise exception 'Flow % contains invalid step slug "%"', p_flow_slug, v_step_slug;
    end if;

    if jsonb_typeof(v_step->'dependencies') is distinct from 'array' then
      raise exception 'Flow % step "%" requires a dependencies array', p_flow_slug, v_step_slug;
    end if;

    -- Dependency names preserve exact spelling and satisfy the slug rules
    for v_dep in select * from jsonb_array_elements_text(v_step->'dependencies') loop
      if not pgflow.is_valid_slug(v_dep) then
        raise exception 'Flow % step "%" has invalid dependency slug "%"', p_flow_slug, v_step_slug, v_dep;
      end if;
    end loop;
  end loop;

  -- Case-only duplicate step identities inside the shape are rejected while
  -- exact spelling is preserved.
  select s1->>'slug' into v_conflict
  from jsonb_array_elements(p_shape->'steps') s1,
       jsonb_array_elements(p_shape->'steps') s2
  where lower(s1->>'slug') = lower(s2->>'slug')
    and s1->>'slug' <> s2->>'slug'
  limit 1;

  if v_conflict is not null then
    raise exception 'Flow % contains case-only duplicate step identities (first conflict: "%")',
      p_flow_slug, v_conflict;
  end if;
end;
$$;
-- Modify "_create_flow_from_shape" function
CREATE OR REPLACE FUNCTION "pgflow"."_create_flow_from_shape" ("p_flow_slug" text, "p_shape" jsonb) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_step jsonb;
  v_deps text[];
  v_flow_options jsonb;
  v_step_options jsonb;
  v_canonical_queue text := lower(p_flow_slug);
BEGIN
  -- Preflight the complete shape under the canonical flow lock before any
  -- mutation: a late invalid step must not leave earlier queues/definitions.
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(p_flow_slug)));
  PERFORM pgflow._validate_flow_shape(p_flow_slug, p_shape);

  -- Extract flow-level options (may be null)
  v_flow_options := p_shape->'options';

  -- Create the flow definition (definition-only; no queue DDL)
  PERFORM pgflow.create_flow(
    p_flow_slug,
    (v_flow_options->>'maxAttempts')::int,
    (v_flow_options->>'baseDelay')::int,
    (v_flow_options->>'timeout')::int
  );

  -- Provision the generated default queue for the persisted identity
  PERFORM pgflow._ensure_generated_queue(p_flow_slug, v_canonical_queue);

  -- Iterate over steps in order and add each one with its resolved route
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_shape->'steps')
  LOOP
    -- Convert dependencies jsonb array to text array
    SELECT COALESCE(array_agg(dep), '{}')
    INTO v_deps
    FROM jsonb_array_elements_text(COALESCE(v_step->'dependencies', '[]'::jsonb)) AS dep;

    -- Extract step options (may be null)
    v_step_options := v_step->'options';

    -- Add the step with options (NULL = use default/inherit)
    PERFORM pgflow.add_step(
      flow_slug => p_flow_slug,
      step_slug => v_step->>'slug',
      deps_slugs => v_deps,
      max_attempts => (v_step_options->>'maxAttempts')::int,
      base_delay => (v_step_options->>'baseDelay')::int,
      timeout => (v_step_options->>'timeout')::int,
      start_delay => (v_step_options->>'startDelay')::int,
      step_type => v_step->>'stepType',
      when_unmet => COALESCE(v_step->>'whenUnmet', 'skip'),
      when_exhausted => COALESCE(v_step->>'whenExhausted', 'fail'),
      required_input_pattern => CASE
        WHEN (v_step->'requiredInputPattern'->>'defined')::boolean
        THEN v_step->'requiredInputPattern'->'value'
        ELSE NULL
      END,
      forbidden_input_pattern => CASE
        WHEN (v_step->'forbiddenInputPattern'->>'defined')::boolean
        THEN v_step->'forbiddenInputPattern'->'value'
        ELSE NULL
      END,
      queue_name => v_canonical_queue
    );
  END LOOP;
END;
$$;
-- Modify "cascade_resolve_conditions" function
CREATE OR REPLACE FUNCTION "pgflow"."cascade_resolve_conditions" ("run_id" uuid) RETURNS boolean LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_input jsonb;
  v_run_status text;
  v_first_fail record;
  v_iteration_count int := 0;
  v_max_iterations int := 50;
  v_processed_count int;
  v_run_transitioned boolean;
  v_flow_slug text;
  v_archive_batch record;
BEGIN
  -- ==========================================
  -- GUARD: Early return if run is already terminal
  -- ==========================================
  SELECT r.status, r.input INTO v_run_status, v_run_input
  FROM pgflow.runs r
  WHERE r.run_id = cascade_resolve_conditions.run_id;

  IF v_run_status IN ('failed', 'completed') THEN
    RETURN v_run_status != 'failed';
  END IF;

  -- ==========================================
  -- ITERATE UNTIL CONVERGENCE
  -- ==========================================
  -- After skipping steps, dependents may become ready and need evaluation.
  -- Loop until no more steps are processed.
  LOOP
    v_iteration_count := v_iteration_count + 1;
    IF v_iteration_count > v_max_iterations THEN
      RAISE EXCEPTION 'cascade_resolve_conditions exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    v_processed_count := 0;

    -- ==========================================
    -- PHASE 1a: CHECK FOR FAIL CONDITIONS
    -- ==========================================
    -- Find first step (by topological order) with unmet condition and 'fail' mode.
    -- Condition is unmet when:
    --   (required_input_pattern is set AND input does NOT contain it) OR
    --   (forbidden_input_pattern is set AND input DOES contain it)
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.required_input_pattern,
        step.forbidden_input_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.required_input_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.required_input_pattern)
        AND
        (swc.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.forbidden_input_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    )
    SELECT
      flow_slug,
      step_slug,
      required_input_pattern,
      forbidden_input_pattern
    INTO v_first_fail
    FROM condition_evaluations
    WHERE NOT condition_met AND when_unmet = 'fail'
    ORDER BY step_index
    LIMIT 1;

    -- Handle fail mode: fail step and run, return false
    -- Note: Cannot use "v_first_fail IS NOT NULL" because records with NULL fields
    -- evaluate to NULL in IS NOT NULL checks. Use FOUND instead.
    IF FOUND THEN
      -- Fail the run only if it is still started. The conditional UPDATE takes
      -- the run row lock and rechecks status atomically, so replayed or
      -- concurrent calls cannot duplicate the terminal transition or its events.
      UPDATE pgflow.runs
      SET status = 'failed',
          failed_at = now()
      WHERE pgflow.runs.run_id = cascade_resolve_conditions.run_id
        AND pgflow.runs.status = 'started'
      RETURNING true INTO v_run_transitioned;

      IF v_run_transitioned THEN
        UPDATE pgflow.step_states
        SET status = 'failed',
            failed_at = now(),
            error_message = 'Condition not met'
        WHERE pgflow.step_states.run_id = cascade_resolve_conditions.run_id
          AND pgflow.step_states.step_slug = v_first_fail.step_slug;

        PERFORM realtime.send(
          jsonb_build_object(
            'event_type', 'step:failed',
            'run_id', cascade_resolve_conditions.run_id,
            'step_slug', v_first_fail.step_slug,
            'status', 'failed',
            'error_message', 'Condition not met',
            'failed_at', now()
          ),
          concat('step:', v_first_fail.step_slug, ':failed'),
          concat('pgflow:run:', cascade_resolve_conditions.run_id),
          false
        );

        PERFORM realtime.send(
          jsonb_build_object(
            'event_type', 'run:failed',
            'run_id', cascade_resolve_conditions.run_id,
            'flow_slug', v_first_fail.flow_slug,
            'status', 'failed',
            'error_message', 'Condition not met',
            'failed_at', now()
          ),
          'run:failed',
          concat('pgflow:run:', cascade_resolve_conditions.run_id),
          false
        );

        -- Terminalize every unfinished task across all branches as cancelled,
        -- capturing their queue/message pairs for archival below. Lock-order
        -- invariant: always lock/update step_tasks before PGMQ queue rows.
        FOR v_archive_batch IN
          WITH cancelled_tasks AS (
            UPDATE pgflow.step_tasks AS task
            SET status = 'cancelled'
            WHERE task.run_id = cascade_resolve_conditions.run_id
              AND task.status IN ('queued', 'started')
            RETURNING task.queue_name, task.message_id
          )
          SELECT
            ct.queue_name,
            ARRAY_AGG(ct.message_id ORDER BY ct.message_id) AS ids
          FROM cancelled_tasks ct
          WHERE ct.message_id IS NOT NULL
          GROUP BY ct.queue_name
        LOOP
          PERFORM pgmq.archive(v_archive_batch.queue_name, v_archive_batch.ids);
        END LOOP;
      END IF;

      RETURN false;
    END IF;

    -- ==========================================
    -- PHASE 1b: HANDLE SKIP CONDITIONS (with propagation)
    -- ==========================================
    -- Skip steps with unmet conditions and whenUnmet='skip'.
    -- Also decrement remaining_deps on dependents and set initial_tasks=0 for map dependents.
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.required_input_pattern,
        step.forbidden_input_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.required_input_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.required_input_pattern)
        AND
        (swc.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.forbidden_input_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    ),
    unmet_skip_steps AS (
      SELECT * FROM condition_evaluations
      WHERE NOT condition_met AND when_unmet = 'skip'
    ),
    skipped_steps AS (
      UPDATE pgflow.step_states ss
      SET status = 'skipped',
          skip_reason = 'condition_unmet',
          skipped_at = now()
      FROM unmet_skip_steps uss
      WHERE ss.run_id = cascade_resolve_conditions.run_id
        AND ss.step_slug = uss.step_slug
        AND ss.status = 'created'
      RETURNING
        ss.*,
        realtime.send(
          jsonb_build_object(
            'event_type', 'step:skipped',
            'run_id', ss.run_id,
            'flow_slug', ss.flow_slug,
            'step_slug', ss.step_slug,
            'status', 'skipped',
            'skip_reason', 'condition_unmet',
            'skipped_at', ss.skipped_at
          ),
          concat('step:', ss.step_slug, ':skipped'),
          concat('pgflow:run:', ss.run_id),
          false
        ) AS _broadcast_result
    ),
    -- NEW: Update dependent steps (decrement remaining_deps by count of skipped parents, set initial_tasks=0 for maps)
    skipped_parent_counts AS (
      -- Count how many skipped parents each child has
      SELECT
        dep.step_slug AS child_step_slug,
        dep.flow_slug AS child_flow_slug,
        COUNT(*) AS skipped_parent_count
      FROM skipped_steps parent
      JOIN pgflow.deps dep ON dep.flow_slug = parent.flow_slug AND dep.dep_slug = parent.step_slug
      GROUP BY dep.step_slug, dep.flow_slug
    ),
    dependent_updates AS (
      UPDATE pgflow.step_states child_state
      SET remaining_deps = child_state.remaining_deps - spc.skipped_parent_count,
          -- If child is a map step and this skipped step is its only dependency,
          -- set initial_tasks = 0 (skipped dep = empty array)
          initial_tasks = CASE
            WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
            ELSE child_state.initial_tasks
          END
      FROM skipped_parent_counts spc
      JOIN pgflow.steps child_step ON child_step.flow_slug = spc.child_flow_slug AND child_step.step_slug = spc.child_step_slug
      WHERE child_state.run_id = cascade_resolve_conditions.run_id
        AND child_state.step_slug = spc.child_step_slug
    ),
    run_update AS (
      UPDATE pgflow.runs r
      SET remaining_steps = r.remaining_steps - (SELECT COUNT(*) FROM skipped_steps)
      WHERE r.run_id = cascade_resolve_conditions.run_id
        AND (SELECT COUNT(*) FROM skipped_steps) > 0
    )
    SELECT COUNT(*)::int INTO v_processed_count FROM skipped_steps;

    -- ==========================================
    -- PHASE 1c: HANDLE SKIP-CASCADE CONDITIONS
    -- ==========================================
    -- Call _cascade_force_skip_steps for each step with unmet condition and whenUnmet='skip-cascade'.
    -- Process in topological order; _cascade_force_skip_steps is idempotent.
    PERFORM pgflow._cascade_force_skip_steps(cascade_resolve_conditions.run_id, ready_step.step_slug, 'condition_unmet')
    FROM pgflow.step_states AS ready_step
    JOIN pgflow.steps AS step
      ON step.flow_slug = ready_step.flow_slug
      AND step.step_slug = ready_step.step_slug
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM pgflow.deps dep
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE dep.flow_slug = ready_step.flow_slug
        AND dep.step_slug = ready_step.step_slug
    ) AS agg_deps ON step.deps_count > 0
    WHERE ready_step.run_id = cascade_resolve_conditions.run_id
      AND ready_step.status = 'created'
      AND ready_step.remaining_deps = 0
      AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
      AND step.when_unmet = 'skip-cascade'
      -- Condition is NOT met when: (if fails) OR (ifNot fails)
      AND NOT (
        (step.required_input_pattern IS NULL OR
          CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.required_input_pattern)
        AND
        (step.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.forbidden_input_pattern))
      )
    ORDER BY step.step_index;

    -- Check if run was failed during cascade (e.g., if _cascade_force_skip_steps triggers fail)
    SELECT r.status INTO v_run_status
    FROM pgflow.runs r
    WHERE r.run_id = cascade_resolve_conditions.run_id;

    IF v_run_status IN ('failed', 'completed') THEN
      RETURN v_run_status != 'failed';
    END IF;

    -- Exit loop if no steps were processed in this iteration
    EXIT WHEN v_processed_count = 0;
  END LOOP;

  RETURN true;
END;
$$;
-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
BEGIN
-- ==========================================
-- GUARD: No mutations on terminal runs
-- ==========================================
IF EXISTS (
  SELECT 1 FROM pgflow.runs
  WHERE pgflow.runs.run_id = start_ready_steps.run_id
    AND pgflow.runs.status IN ('failed', 'completed')
) THEN
  RETURN;
END IF;

-- ==========================================
-- PHASE 1: START READY STEPS
-- ==========================================
-- NOTE: Condition evaluation and empty map handling are done by
-- cascade_resolve_conditions() and cascade_complete_taskless_steps()
-- which are called before this function.
WITH
-- ---------- Find ready steps ----------
-- Steps with no remaining deps and known task count
ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step_state.initial_tasks IS NOT NULL  -- Cannot start with unknown count
    AND step_state.initial_tasks > 0  -- Don't start taskless steps (handled by cascade_complete_taskless_steps)
  ORDER BY step_state.step_slug
  FOR UPDATE
),
-- ---------- Mark steps as started ----------
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started',
      started_at = now(),
      remaining_tasks = ready_steps.initial_tasks  -- Copy initial_tasks to remaining_tasks when starting
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*,
    -- Broadcast step:started event atomically with the UPDATE
    -- Using RETURNING ensures this executes during row processing
    -- and cannot be optimized away by the query planner
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:started',
        'run_id', pgflow.step_states.run_id,
        'step_slug', pgflow.step_states.step_slug,
        'status', 'started',
        'started_at', pgflow.step_states.started_at,
        'remaining_tasks', pgflow.step_states.remaining_tasks,
        'remaining_deps', pgflow.step_states.remaining_deps
      ),
      concat('step:', pgflow.step_states.step_slug, ':started'),
      concat('pgflow:run:', pgflow.step_states.run_id),
      false
    ) as _broadcast_result  -- Prefix with _ to indicate internal use only
),

-- ==========================================
-- PHASE 2: TASK GENERATION AND QUEUE MESSAGES
-- ==========================================
-- ---------- Generate tasks and batch messages ----------
-- Single steps: 1 task (index 0)
-- Map steps: N tasks (indices 0..N-1)
message_batches AS (
  SELECT
    started_step.flow_slug,
    started_step.run_id,
    started_step.step_slug,
    step.queue_name,
    COALESCE(step.opt_start_delay, 0) as delay,
    array_agg(
      jsonb_build_object(
        'flow_slug', started_step.flow_slug,
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'task_index', task_idx.task_index
      ) ORDER BY task_idx.task_index
    ) AS messages,
    array_agg(task_idx.task_index ORDER BY task_idx.task_index) AS task_indices
  FROM started_step_states AS started_step
  JOIN pgflow.steps AS step
    ON step.flow_slug = started_step.flow_slug
    AND step.step_slug = started_step.step_slug
  -- Generate task indices from 0 to initial_tasks-1
  CROSS JOIN LATERAL generate_series(0, started_step.initial_tasks - 1) AS task_idx(task_index)
  GROUP BY started_step.flow_slug, started_step.run_id, started_step.step_slug, step.queue_name, step.opt_start_delay
),
-- ---------- Send messages to queue ----------
-- Uses batch sending for performance with large arrays
-- Sends to each step's resolved route; performs no queue DDL (#650)
sent_messages AS (
  SELECT
    mb.flow_slug,
    mb.run_id,
    mb.step_slug,
    mb.queue_name,
    task_indices.task_index,
    msg_ids.msg_id
  FROM message_batches mb
  CROSS JOIN LATERAL unnest(mb.task_indices) WITH ORDINALITY AS task_indices(task_index, idx_ord)
  CROSS JOIN LATERAL pgmq.send_batch(mb.queue_name, mb.messages, mb.delay) WITH ORDINALITY AS msg_ids(msg_id, msg_ord)
  WHERE task_indices.idx_ord = msg_ids.msg_ord
)

-- ==========================================
-- PHASE 3: RECORD TASKS IN DATABASE
-- ==========================================
-- The task snapshots the resolved queue; the snapshot never changes after
-- insertion (#650).
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, queue_name, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.task_index,
  sent_messages.queue_name,
  sent_messages.msg_id
FROM sent_messages;

END;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step_state pgflow.step_states%ROWTYPE;
  v_dependent_map_slug text;
  v_run_record pgflow.runs%ROWTYPE;
  v_step_record pgflow.step_states%ROWTYPE;
  v_archive_batch record;
begin

-- ==========================================
-- GUARD: No mutations on failed runs
-- ==========================================
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = complete_task.run_id AND pgflow.runs.status = 'failed') THEN
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- LOCK ACQUISITION AND TYPE VALIDATION
-- ==========================================
-- Acquire locks first to prevent race conditions
SELECT * INTO v_run_record FROM pgflow.runs
WHERE pgflow.runs.run_id = complete_task.run_id
FOR UPDATE;

SELECT * INTO v_step_record FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id
  AND pgflow.step_states.step_slug = complete_task.step_slug
FOR UPDATE;

-- ==========================================
-- GUARD: Run failed while this callback waited for the lock
-- ==========================================
-- The failed-run guard above ran before the failure committed. Recheck under
-- lock so cancellation wins: archived message stays archived, task row keeps
-- its terminal status, and no events or counters are emitted.
IF v_run_record.status = 'failed' THEN
  -- Archive the task message if present (no-op when already archived)
  PERFORM pgflow._archive_task_message(
    complete_task.run_id,
    complete_task.step_slug,
    complete_task.task_index
  );
  -- Return the current task row without any mutations
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- GUARD: Late callback - step not started
-- ==========================================
-- If the step is not in 'started' state, this is a late callback.
-- Do not mutate step_states or runs, archive message, return task row.
IF v_step_record.status != 'started' THEN
  -- Archive the task message if present (prevents stuck work) through the
  -- locked single-task helper; run/step locks are already held here
  PERFORM pgflow._archive_task_message(
    complete_task.run_id,
    complete_task.step_slug,
    complete_task.task_index
  );
  -- Return the current task row without any mutations
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- Check for type violations AFTER acquiring locks
SELECT child_step.step_slug INTO v_dependent_map_slug
FROM pgflow.deps dependency
JOIN pgflow.steps child_step ON child_step.flow_slug = dependency.flow_slug
                             AND child_step.step_slug = dependency.step_slug
JOIN pgflow.steps parent_step ON parent_step.flow_slug = dependency.flow_slug
                              AND parent_step.step_slug = dependency.dep_slug
JOIN pgflow.step_states child_state ON child_state.flow_slug = child_step.flow_slug
                                    AND child_state.step_slug = child_step.step_slug
WHERE dependency.dep_slug = complete_task.step_slug  -- parent is the completing step
  AND dependency.flow_slug = v_run_record.flow_slug
  AND parent_step.step_type = 'single'  -- Only validate single steps
  AND child_step.step_type = 'map'
  AND child_state.run_id = complete_task.run_id
  AND child_state.initial_tasks IS NULL
  AND (complete_task.output IS NULL OR jsonb_typeof(complete_task.output) != 'array')
LIMIT 1;

-- Handle type violation if detected
IF v_dependent_map_slug IS NOT NULL THEN
  -- Mark current task as failed FIRST and store the output that caused the
  -- violation, so the task row is terminal before any queue row is touched.
  UPDATE pgflow.step_tasks
  SET status = 'failed',
      failed_at = now(),
      output = complete_task.output,  -- Store the output that caused the violation
      error_message = '[TYPE_VIOLATION] Produced ' ||
                     CASE WHEN complete_task.output IS NULL THEN 'null'
                          ELSE jsonb_typeof(complete_task.output) END ||
                     ' instead of array'
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index;

  -- Mark run as failed immediately
  UPDATE pgflow.runs
  SET status = 'failed',
      failed_at = now()
  WHERE pgflow.runs.run_id = complete_task.run_id;

  -- Broadcast run:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'run:failed',
      'run_id', complete_task.run_id,
      'flow_slug', v_run_record.flow_slug,
      'status', 'failed',
      'failed_at', now()
    ),
    'run:failed',
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Mark step state as failed
  UPDATE pgflow.step_states
  SET status = 'failed',
      failed_at = now(),
      error_message = '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                     ' expects array input but dependency ' || complete_task.step_slug ||
                     ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                         ELSE jsonb_typeof(complete_task.output) END
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug;

  -- Broadcast step:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:failed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'failed',
      'error_message', '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                      ' expects array input but dependency ' || complete_task.step_slug ||
                      ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                          ELSE jsonb_typeof(complete_task.output) END,
      'failed_at', now()
    ),
    concat('step:', complete_task.step_slug, ':failed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Terminalize every other unfinished task as cancelled, capturing their
  -- queue/message pairs for archival below. Lock-order invariant: always
  -- lock/update step_tasks before PGMQ queue rows. The culprit task is
  -- already terminal (failed above), so it is excluded from the cancellation
  -- set. The grouped FOR forces the cancellation UPDATE to run before any
  -- archive call.
  FOR v_archive_batch IN
    WITH cancelled_tasks AS (
      UPDATE pgflow.step_tasks AS task
      SET status = 'cancelled'
      WHERE task.run_id = complete_task.run_id
        AND task.status IN ('queued', 'started')
      RETURNING task.queue_name, task.message_id
    ),
    culprit_task AS (
      -- Terminal culprit row: safe to read for its queue/message pair after
      -- terminalization
      SELECT st.queue_name, st.message_id
      FROM pgflow.step_tasks st
      WHERE st.run_id = complete_task.run_id
        AND st.step_slug = complete_task.step_slug
        AND st.task_index = complete_task.task_index
        AND st.message_id IS NOT NULL
    ),
    archived_pairs AS (
      SELECT
        ids.queue_name,
        ARRAY_AGG(ids.message_id ORDER BY ids.message_id) AS ids
      FROM (
        SELECT queue_name, message_id FROM culprit_task
        UNION ALL
        SELECT queue_name, message_id FROM cancelled_tasks WHERE message_id IS NOT NULL
      ) ids
      GROUP BY ids.queue_name
    )
    SELECT ap.queue_name, ap.ids FROM archived_pairs ap
  LOOP
    PERFORM pgmq.archive(v_archive_batch.queue_name, v_archive_batch.ids);
  END LOOP;

  -- Return the failed task row (API contract: always return task row)
  RETURN QUERY
  SELECT * FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.step_slug = complete_task.step_slug
    AND st.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Update task and propagate changes
-- ==========================================
WITH
-- ---------- Task completion ----------
-- Update the task record with completion status and output
task AS (
  UPDATE pgflow.step_tasks
  SET
    status = 'completed',
    completed_at = now(),
    output = complete_task.output
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index
    AND pgflow.step_tasks.status = 'started'
  RETURNING *
),
-- ---------- Get step type for output handling ----------
step_def AS (
  SELECT step.step_type
  FROM pgflow.steps step
  JOIN pgflow.runs run ON run.flow_slug = step.flow_slug
  WHERE run.run_id = complete_task.run_id
    AND step.step_slug = complete_task.step_slug
),
-- ---------- Step state update ----------
-- Decrement remaining_tasks and potentially mark step as completed
-- Also store output atomically with status transition to completed
step_state AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN 'completed'  -- Will be 0 after decrement
    ELSE 'started'
    END,
    completed_at = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN now()  -- Will be 0 after decrement
    ELSE NULL
    END,
    remaining_tasks = pgflow.step_states.remaining_tasks - 1,
    -- Store output atomically with completion (only when remaining_tasks = 1, meaning step completes)
    output = CASE
      -- Single step: store task output directly when completing
      WHEN (SELECT step_type FROM step_def) = 'single' AND pgflow.step_states.remaining_tasks = 1 THEN
        complete_task.output
      -- Map step: aggregate on completion (ordered by task_index)
      WHEN (SELECT step_type FROM step_def) = 'map' AND pgflow.step_states.remaining_tasks = 1 THEN
        (SELECT COALESCE(jsonb_agg(all_outputs.output ORDER BY all_outputs.task_index), '[]'::jsonb)
         FROM (
           -- All previously completed tasks
           SELECT st.output, st.task_index
           FROM pgflow.step_tasks st
           WHERE st.run_id = complete_task.run_id
             AND st.step_slug = complete_task.step_slug
             AND st.status = 'completed'
           UNION ALL
           -- Current task being completed (not yet visible as completed in snapshot)
           SELECT complete_task.output, complete_task.task_index
         ) all_outputs)
      ELSE pgflow.step_states.output
    END
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
),
-- ---------- Dependency resolution ----------
-- Find all child steps that depend on the completed parent step (only if parent completed)
child_steps AS (
  SELECT deps.step_slug AS child_step_slug
  FROM pgflow.deps deps
  JOIN step_state parent_state ON parent_state.status = 'completed' AND deps.flow_slug = parent_state.flow_slug
  WHERE deps.dep_slug = complete_task.step_slug  -- dep_slug is the parent, step_slug is the child
  ORDER BY deps.step_slug  -- Ensure consistent ordering
),
-- ---------- Lock child steps ----------
-- Acquire locks on all child steps before updating them
child_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT child_step_slug FROM child_steps)
  FOR UPDATE
),
-- ---------- Update child steps ----------
-- Decrement remaining_deps and resolve NULL initial_tasks for map steps
child_steps_update AS (
  UPDATE pgflow.step_states child_state
  SET remaining_deps = child_state.remaining_deps - 1,
      -- Resolve NULL initial_tasks for child map steps
      -- This is where child maps learn their array size from the parent
      -- This CTE only runs when the parent step is complete (see child_steps JOIN)
      initial_tasks = CASE
        WHEN child_step.step_type = 'map' AND child_state.initial_tasks IS NULL THEN
          CASE
            WHEN parent_step.step_type = 'map' THEN
              -- Map->map: Count all completed tasks from parent map
              -- We add 1 because the current task is being completed in this transaction
              -- but isn't yet visible as 'completed' in the step_tasks table
              -- TODO: Refactor to use future column step_states.total_tasks
              -- Would eliminate the COUNT query and just use parent_state.total_tasks
              (SELECT COUNT(*)::int + 1
               FROM pgflow.step_tasks parent_tasks
               WHERE parent_tasks.run_id = complete_task.run_id
                 AND parent_tasks.step_slug = complete_task.step_slug
                 AND parent_tasks.status = 'completed'
                 AND parent_tasks.task_index != complete_task.task_index)
            ELSE
              -- Single->map: Use output array length (single steps complete immediately)
              CASE
                WHEN complete_task.output IS NOT NULL
                     AND jsonb_typeof(complete_task.output) = 'array' THEN
                  jsonb_array_length(complete_task.output)
                ELSE NULL  -- Keep NULL if not an array
              END
          END
        ELSE child_state.initial_tasks  -- Keep existing value (including NULL)
      END
  FROM child_steps children
  JOIN pgflow.steps child_step ON child_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                               AND child_step.step_slug = children.child_step_slug
  JOIN pgflow.steps parent_step ON parent_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                                AND parent_step.step_slug = complete_task.step_slug
  WHERE child_state.run_id = complete_task.run_id
    AND child_state.step_slug = children.child_step_slug
)
-- ---------- Update run remaining_steps ----------
-- Decrement the run's remaining_steps counter if step completed
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

-- ==========================================
-- POST-COMPLETION ACTIONS
-- ==========================================

-- ---------- Get updated state for broadcasting ----------
SELECT * INTO v_step_state FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id AND pgflow.step_states.step_slug = complete_task.step_slug;

-- ---------- Handle step completion ----------
IF v_step_state.status = 'completed' THEN
  -- Broadcast step:completed event FIRST (before cascade)
  -- This ensures parent broadcasts before its dependent children
  -- Use stored output from step_states (set atomically during status transition)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', v_step_state.output,  -- Use stored output instead of re-aggregating
      'completed_at', v_step_state.completed_at
    ),
    concat('step:', complete_task.step_slug, ':completed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- THEN evaluate conditions on newly-ready dependent steps
  -- This must happen before cascade_complete_taskless_steps so that
  -- skipped steps can set initial_tasks=0 for their map dependents
  IF NOT pgflow.cascade_resolve_conditions(complete_task.run_id) THEN
    -- Run was failed due to a condition with when_unmet='fail'
    -- Archive the current task's message before returning through the
    -- locked single-task helper
    PERFORM pgflow._archive_task_message(
      complete_task.run_id,
      complete_task.step_slug,
      complete_task.task_index
    );
    RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = complete_task.run_id
        AND pgflow.step_tasks.step_slug = complete_task.step_slug
        AND pgflow.step_tasks.task_index = complete_task.task_index;
    RETURN;
  END IF;

  -- THEN cascade complete any taskless steps that are now ready
  -- This ensures dependent children broadcast AFTER their parent
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);
END IF;

-- ---------- Archive completed task message ----------
-- Move message from active queue to archive table using the task's queue
-- snapshot (#650)
PERFORM (
  WITH completed_tasks AS (
    SELECT st.queue_name, st.message_id
    FROM pgflow.step_tasks st
    WHERE st.run_id = complete_task.run_id
      AND st.step_slug = complete_task.step_slug
      AND st.task_index = complete_task.task_index
      AND st.status = 'completed'
  )
  SELECT pgmq.archive(ct.queue_name, ct.message_id)
  FROM completed_tasks ct
  WHERE EXISTS (SELECT 1 FROM completed_tasks)
);

-- ---------- Trigger next steps ----------
-- Start any steps that are now ready (deps satisfied)
PERFORM pgflow.start_ready_steps(complete_task.run_id);

-- Check if the entire run is complete
PERFORM pgflow.maybe_complete_run(complete_task.run_id);

-- ---------- Return completed task ----------
RETURN QUERY SELECT *
FROM pgflow.step_tasks AS step_task
WHERE step_task.run_id = complete_task.run_id
  AND step_task.step_slug = complete_task.step_slug
  AND step_task.task_index = complete_task.task_index;

end;
$$;
-- Modify "delete_flow_and_data" function
CREATE OR REPLACE FUNCTION "pgflow"."delete_flow_and_data" ("p_flow_slug" text) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_route text[];
  v_route_names text[];
  v_metadata_names text[];
  v_snapshot_violation record;
  v_queue text;
  v_inspect_result jsonb;
  v_idx int;
BEGIN
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(p_flow_slug)));

  -- Retain and lock the concrete identity; reject a missing flow
  IF NOT EXISTS (
    SELECT 1 FROM pgflow.flows f
    WHERE f.flow_slug = p_flow_slug
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Flow % does not exist', p_flow_slug;
  END IF;

  -- Runtime locks in the established order, before any queue/metadata access
  PERFORM 1 FROM pgflow.runs r
  WHERE r.flow_slug = p_flow_slug
  ORDER BY r.run_id
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_states s
  WHERE s.flow_slug = p_flow_slug
  ORDER BY s.run_id, s.step_slug
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_tasks t
  WHERE t.flow_slug = p_flow_slug
  ORDER BY t.run_id, t.step_slug, t.task_index
  FOR UPDATE;

  -- Topology fence after runtime locks (never the reverse order)
  LOCK TABLE pgmq.meta IN SHARE ROW EXCLUSIVE MODE;

  -- Capture the complete private route: persisted steps plus the default for
  -- an empty plain flow. An unprovisioned definition-only flow is not
  -- permission to drop a same-named resource; _inspect_generated_queue
  -- rejects that below.
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT s.queue_name ORDER BY s.queue_name),
    ARRAY[lower(p_flow_slug)]
  ) INTO v_route
  FROM pgflow.steps s
  WHERE s.flow_slug = p_flow_slug;

  -- Validate every task snapshot against the captured route
  SELECT t.run_id, t.step_slug, t.task_index, t.queue_name
  INTO v_snapshot_violation
  FROM pgflow.step_tasks t
  WHERE t.flow_slug = p_flow_slug
    AND NOT (t.queue_name = ANY(v_route))
  ORDER BY t.run_id, t.step_slug, t.task_index
  LIMIT 1;

  IF v_snapshot_violation IS NOT NULL THEN
    RAISE EXCEPTION 'Flow %: task %/%/% snapshot queue "%" is outside the validated private route; refusing deletion',
      p_flow_slug,
      v_snapshot_violation.run_id,
      v_snapshot_violation.step_slug,
      v_snapshot_violation.task_index,
      v_snapshot_violation.queue_name;
  END IF;

  v_route_names := v_route;
  v_metadata_names := ARRAY[]::text[];

  -- Resolve exact metadata spelling and physical validity per route queue;
  -- this also rejects missing, ambiguous, malformed, or differently owned
  -- resources instead of dropping an uncertain physical queue.
  FOR v_idx IN 1..COALESCE(array_length(v_route, 1), 0)
  LOOP
    v_queue := v_route[v_idx];
    v_inspect_result := pgflow._inspect_generated_queue(p_flow_slug, v_queue, true);

    -- Lock the validated physical queue/archive tables before mutation
    EXECUTE format(
      'LOCK TABLE pgmq.%I, pgmq.%I IN ACCESS EXCLUSIVE MODE',
      pgmq.format_table_name(v_queue, 'q'),
      pgmq.format_table_name(v_queue, 'a')
    );

    -- Recheck ownership/shape after the physical locks are held
    v_inspect_result := pgflow._inspect_generated_queue(p_flow_slug, v_queue, true);

    -- Remember the exact metadata spelling for the drop below: the flow row
    -- and step definitions may be gone by then.
    v_metadata_names[v_idx] := v_inspect_result ->> 'metadata_name';
  END LOOP;

  -- Delete runtime rows and step definitions in FK order while retaining the
  -- flow identity and captured validated queue names
  DELETE FROM pgflow.step_tasks AS task WHERE task.flow_slug = p_flow_slug;
  DELETE FROM pgflow.step_states AS state WHERE state.flow_slug = p_flow_slug;
  DELETE FROM pgflow.runs AS run WHERE run.flow_slug = p_flow_slug;
  DELETE FROM pgflow.deps AS dep WHERE dep.flow_slug = p_flow_slug;
  DELETE FROM pgflow.steps AS step WHERE step.flow_slug = p_flow_slug;

  -- Drop each validated private queue using its exact metadata spelling.
  -- No per-message archival/deletion happens before the whole-queue drop.
  FOR v_idx IN 1..COALESCE(array_length(v_route_names, 1), 0)
  LOOP
    PERFORM pgmq.drop_queue(v_metadata_names[v_idx]);
  END LOOP;

  -- Delete the concrete flow identity row last
  DELETE FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug;
END;
$$;
-- Modify "requeue_stalled_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."requeue_stalled_tasks" () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = '' AS $$
declare
  result_count int := 0;
  max_requeues constant int := 3;
begin
  -- Find and requeue stalled tasks (where started_at > effective timeout + 30s buffer)
  -- Tasks with requeued_count >= max_requeues will have their message archived
  -- but status left as 'started' for easy identification via requeued_count column
  -- Eligibility requires the parent run AND parent step to still be 'started':
  -- stale rows on failed runs or terminal steps must not be revived (#645).
  --
  -- Lock order (#650): eligible parent runs and step states are locked before
  -- task rows (ordered by (run_id, step_slug, task_index)), with SKIP LOCKED
  -- so a blocked parent/run/task is skipped, not waited on. Status and timeout
  -- predicates are rechecked under those locks by EvalPlanQual, so a parent
  -- that failed while we waited is not revived.
  with stalled_tasks as (
    select
      st.run_id,
      st.step_slug,
      st.task_index,
      st.message_id,
      st.queue_name,
      st.requeued_count
    from pgflow.step_tasks st
    join pgflow.runs r on r.run_id = st.run_id
    join pgflow.step_states ss on ss.run_id = st.run_id and ss.step_slug = st.step_slug
    join pgflow.flows f on f.flow_slug = r.flow_slug
    join pgflow.steps s on s.flow_slug = r.flow_slug and s.step_slug = st.step_slug
    where st.status = 'started'
      and r.status = 'started'
      and ss.status = 'started'
      and st.permanently_stalled_at is null
      and st.started_at < now()
        - (coalesce(s.opt_timeout, f.opt_timeout) * interval '1 second')
        - interval '30 seconds'
    order by st.run_id, st.step_slug, st.task_index
    for update of r, ss, st skip locked
  ),
  -- Separate tasks that can be requeued from those that exceeded max requeues
  to_requeue as (
    select * from stalled_tasks where requeued_count < max_requeues
  ),
  to_archive as (
    select * from stalled_tasks where requeued_count >= max_requeues
  ),
  -- Update tasks that will be requeued; the queue comes from the task snapshot
  requeued as (
    update pgflow.step_tasks st
    set
      status = 'queued',
      started_at = null,
      last_worker_id = null,
      requeued_count = st.requeued_count + 1,
      last_requeued_at = now()
    from to_requeue tr
    where st.run_id = tr.run_id
      and st.step_slug = tr.step_slug
      and st.task_index = tr.task_index
    returning tr.queue_name as queue_name, tr.message_id
  ),
  -- Make requeued messages visible immediately (batched per queue snapshot)
  visibility_reset as (
    select pgflow.set_vt_batch(
      r.queue_name,
      array_agg(r.message_id order by r.message_id),
      array_agg(0 order by r.message_id)  -- all offsets are 0 (immediate visibility)
    )
    from requeued r
    where r.message_id is not null
    group by r.queue_name
  ),
  -- Mark tasks as permanently stalled before archiving
  mark_permanently_stalled as (
    update pgflow.step_tasks st
    set permanently_stalled_at = now()
    from to_archive ta
    where st.run_id = ta.run_id
      and st.step_slug = ta.step_slug
      and st.task_index = ta.task_index
    returning st.run_id
  ),
  -- Archive messages for tasks that exceeded max requeues (batched per queue
  -- snapshot; never grouped across queues)
  archived as (
    select pgmq.archive(ta.queue_name, array_agg(ta.message_id))
    from to_archive ta
    where ta.message_id is not null
    group by ta.queue_name
  )
  -- Force execution of every side-effecting CTE regardless of join order:
  -- a cross join with an empty relation could skip scanning the forcing
  -- wrappers, so they are evaluated as scalar subqueries that always run.
  select
    (select count(*) from requeued)
    + 0 * coalesce(
        (select count(*) from visibility_reset)
        + (select count(*) from mark_permanently_stalled)
        + (select count(*) from archived),
        0
      )
  into result_count;

  return result_count;
end;
$$;
-- Modify "fail_task" function
CREATE OR REPLACE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_failed boolean;
  v_step_failed boolean;
  v_step_skipped boolean;
  v_when_exhausted text;
  v_task_exhausted boolean;
  v_flow_slug_for_deps text;
  v_prev_step_status text;
  v_run_status text;
  v_flow_slug text;
  v_archive_batch record;
begin

-- If run is already failed, no retries allowed.
-- Cancellation wins: tasks terminalized by the run failure (failed culprit or
-- cancelled siblings) keep their terminal status. This late callback only
-- archives any still-active message and returns the current row unchanged.
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id AND pgflow.runs.status = 'failed') THEN
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

-- Late callback guard: lock run + step rows and use current statuses
-- under lock so concurrent fail_task calls cannot read stale status.
SELECT ss.status, r.status, r.flow_slug INTO v_prev_step_status, v_run_status, v_flow_slug
FROM pgflow.runs r
JOIN pgflow.step_states ss ON ss.run_id = r.run_id
WHERE ss.run_id = fail_task.run_id
  AND ss.step_slug = fail_task.step_slug
FOR UPDATE OF r, ss;

-- Recheck under lock: the run may have failed while this callback waited
-- for the lock (the EXISTS guard above ran before the failure committed).
IF v_run_status = 'failed' THEN
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

IF v_prev_step_status IS NOT NULL AND v_prev_step_status != 'started' THEN
  -- Archive the task message if present, through the locked single-task
  -- helper (locks already held above)
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

WITH flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
  config AS (
  SELECT
    COALESCE(s.opt_max_attempts, f.opt_max_attempts) AS opt_max_attempts,
    COALESCE(s.opt_base_delay, f.opt_base_delay) AS opt_base_delay,
    s.when_exhausted
  FROM pgflow.steps s
  JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
  JOIN flow_info fi ON fi.flow_slug = s.flow_slug
  WHERE s.flow_slug = fi.flow_slug AND s.step_slug = fail_task.step_slug
),
fail_or_retry_task as (
  UPDATE pgflow.step_tasks as task
  SET
    status = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN 'queued'
      ELSE 'failed'
    END,
    failed_at = CASE
      WHEN task.attempts_count >= (SELECT opt_max_attempts FROM config) THEN now()
      ELSE NULL
    END,
    started_at = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN NULL
      ELSE task.started_at
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND task.status = 'started'
  RETURNING *
),
 -- Determine if task exhausted retries and get when_exhausted mode
 task_status AS (
   SELECT
     (select status from fail_or_retry_task) AS new_task_status,
     (select when_exhausted from config) AS when_exhausted_mode,
    -- Task is exhausted when it's failed (no more retries)
    ((select status from fail_or_retry_task) = 'failed') AS is_exhausted
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
     -- Status logic:
     -- - If task not exhausted (retrying): keep current status
     -- - If exhausted AND when_exhausted='fail': set to 'failed'
     -- - If exhausted AND when_exhausted IN ('skip', 'skip-cascade'): set to 'skipped'
     status = CASE
              WHEN NOT (select is_exhausted from task_status) THEN pgflow.step_states.status
              WHEN (select when_exhausted_mode from task_status) = 'fail' THEN 'failed'
              ELSE 'skipped'  -- skip or skip-cascade
              END,
    failed_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) = 'fail' THEN now()
                 ELSE NULL
                 END,
    error_message = CASE
                    WHEN (select is_exhausted from task_status) THEN fail_task.error_message
                    ELSE NULL
                    END,
    skip_reason = CASE
                  WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN 'handler_failed'
                  ELSE pgflow.step_states.skip_reason
                  END,
    skipped_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN now()
                 ELSE pgflow.step_states.skipped_at
                 END,
    -- Clear remaining_tasks when skipping (required by remaining_tasks_state_consistency constraint)
    remaining_tasks = CASE
                      WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN NULL
                      ELSE pgflow.step_states.remaining_tasks
                      END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
),
run_update AS (
  -- Update run status: only fail when when_exhausted='fail' and step was failed
  UPDATE pgflow.runs
  SET status = CASE
               WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
               ELSE status
               END,
      failed_at = CASE
                  WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                  ELSE NULL
                  END,
      -- Decrement remaining_steps only on FIRST transition to skipped
      -- (not when step was already skipped and a second task fails)
      -- Uses PL/pgSQL variable captured before CTE chain
      remaining_steps = CASE
                        WHEN (select status from maybe_fail_step) = 'skipped'
                             AND v_prev_step_status != 'skipped'
                        THEN pgflow.runs.remaining_steps - 1
                        ELSE pgflow.runs.remaining_steps
                        END
  WHERE pgflow.runs.run_id = fail_task.run_id
  RETURNING pgflow.runs.status
)
SELECT
  COALESCE((SELECT status = 'failed' FROM run_update), false),
  COALESCE((SELECT status = 'failed' FROM maybe_fail_step), false),
  COALESCE((SELECT status = 'skipped' FROM maybe_fail_step), false),
  COALESCE((SELECT is_exhausted FROM task_status), false)
INTO v_run_failed, v_step_failed, v_step_skipped, v_task_exhausted;

 -- Capture when_exhausted mode for later skip handling
 SELECT s.when_exhausted INTO v_when_exhausted
 FROM pgflow.steps s
JOIN pgflow.runs r ON r.flow_slug = s.flow_slug
 WHERE r.run_id = fail_task.run_id
   AND s.step_slug = fail_task.step_slug;

-- Send broadcast event for step failure if the step was failed
IF v_task_exhausted AND v_step_failed THEN
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:failed',
      'run_id', fail_task.run_id,
      'step_slug', fail_task.step_slug,
      'status', 'failed',
      'error_message', fail_task.error_message,
      'failed_at', now()
    ),
    concat('step:', fail_task.step_slug, ':failed'),
    concat('pgflow:run:', fail_task.run_id),
    false
  );
END IF;

-- Handle step skipping (when_exhausted = 'skip' or 'skip-cascade')
 IF v_task_exhausted AND v_step_skipped THEN
  -- Lock-order invariant: always lock/update step_tasks before PGMQ queue rows.
  -- requeue_stalled_tasks() uses the same order; archiving queue rows first
  -- deadlocks the two transactions against each other.
  -- Terminalize all still-active sibling task rows for the skipped step,
  -- capturing their queue/message pairs for archival below.
  FOR v_archive_batch IN
    WITH skipped_tasks AS (
      UPDATE pgflow.step_tasks AS task
      SET status = 'skipped'
      WHERE task.run_id = fail_task.run_id
        AND task.step_slug = fail_task.step_slug
        AND task.status IN ('queued', 'started')
      RETURNING task.queue_name, task.message_id
    )
    SELECT
      st.queue_name,
      ARRAY_AGG(st.message_id ORDER BY st.message_id) AS ids
    FROM skipped_tasks st
    WHERE st.message_id IS NOT NULL
    GROUP BY st.queue_name
  LOOP
    PERFORM pgmq.archive(v_archive_batch.queue_name, v_archive_batch.ids);
  END LOOP;

  -- Send broadcast event for step skipped
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:skipped',
      'run_id', fail_task.run_id,
      'step_slug', fail_task.step_slug,
      'status', 'skipped',
      'skip_reason', 'handler_failed',
      'error_message', fail_task.error_message,
      'skipped_at', now()
    ),
    concat('step:', fail_task.step_slug, ':skipped'),
    concat('pgflow:run:', fail_task.run_id),
    false
  );

   -- For skip-cascade: cascade skip to all downstream dependents
   IF v_when_exhausted = 'skip-cascade' THEN
    PERFORM pgflow._cascade_force_skip_steps(fail_task.run_id, fail_task.step_slug, 'handler_failed');
  ELSE
    -- For plain 'skip': decrement remaining_deps on dependent steps
    -- (This mirrors the pattern in cascade_resolve_conditions.sql for when_unmet='skip')
    SELECT flow_slug INTO v_flow_slug_for_deps
    FROM pgflow.runs
    WHERE pgflow.runs.run_id = fail_task.run_id;

    UPDATE pgflow.step_states AS child_state
    SET remaining_deps = child_state.remaining_deps - 1,
        -- If child is a map step and this skipped step is its only dependency,
        -- set initial_tasks = 0 (skipped dep = empty array)
        initial_tasks = CASE
          WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
          ELSE child_state.initial_tasks
        END
    FROM pgflow.deps AS dep
    JOIN pgflow.steps AS child_step ON child_step.flow_slug = dep.flow_slug AND child_step.step_slug = dep.step_slug
    WHERE child_state.run_id = fail_task.run_id
      AND dep.flow_slug = v_flow_slug_for_deps
      AND dep.dep_slug = fail_task.step_slug
      AND child_state.step_slug = dep.step_slug;

    -- Evaluate conditions on newly-ready dependent steps
    -- This must happen before cascade_complete_taskless_steps so that
    -- skipped steps can set initial_tasks=0 for their map dependents
    IF NOT pgflow.cascade_resolve_conditions(fail_task.run_id) THEN
      -- Run was failed due to a condition with when_unmet='fail'
      -- Archive the failed task's message before returning
      PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);
      -- Return the task row (API contract)
      RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = fail_task.run_id
        AND pgflow.step_tasks.step_slug = fail_task.step_slug
        AND pgflow.step_tasks.task_index = fail_task.task_index;
      RETURN;
    END IF;

    -- Auto-complete taskless steps (e.g., map steps with initial_tasks=0 from skipped dep)
    PERFORM pgflow.cascade_complete_taskless_steps(fail_task.run_id);

    -- Start steps that became ready after condition resolution and taskless completion
    PERFORM pgflow.start_ready_steps(fail_task.run_id);
  END IF;

  -- Try to complete the run (remaining_steps may now be 0)
  PERFORM pgflow.maybe_complete_run(fail_task.run_id);
END IF;

-- Send broadcast event for run failure if the run was failed
IF v_run_failed THEN
  DECLARE
    v_flow_slug text;
  BEGIN
    SELECT flow_slug INTO v_flow_slug FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id;

    PERFORM realtime.send(
      jsonb_build_object(
        'event_type', 'run:failed',
        'run_id', fail_task.run_id,
        'flow_slug', v_flow_slug,
        'status', 'failed',
        'error_message', fail_task.error_message,
        'failed_at', now()
      ),
      'run:failed',
      concat('pgflow:run:', fail_task.run_id),
      false
    );
  END;
END IF;

-- Terminalize unfinished tasks as cancelled when the run fails, then archive
-- their messages. Lock-order invariant: always lock/update step_tasks before
-- PGMQ queue rows. The culprit task is already terminal (failed or requeued by
-- fail_or_retry_task), so only unfinished queued/started siblings are cancelled.
IF v_run_failed THEN
  FOR v_archive_batch IN
    WITH cancelled_tasks AS (
      UPDATE pgflow.step_tasks AS task
      SET status = 'cancelled'
      WHERE task.run_id = fail_task.run_id
        AND task.status IN ('queued', 'started')
      RETURNING task.queue_name, task.message_id
    )
    SELECT
      ct.queue_name,
      ARRAY_AGG(ct.message_id ORDER BY ct.message_id) AS ids
    FROM cancelled_tasks ct
    WHERE ct.message_id IS NOT NULL
    GROUP BY ct.queue_name
  LOOP
    PERFORM pgmq.archive(v_archive_batch.queue_name, v_archive_batch.ids);
  END LOOP;
END IF;

-- For queued tasks: delay the message for retry with exponential backoff
PERFORM (
  WITH retry_config AS (
    SELECT
      COALESCE(s.opt_base_delay, f.opt_base_delay) AS base_delay
    FROM pgflow.steps s
    JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
    JOIN pgflow.runs r ON r.flow_slug = f.flow_slug
    WHERE r.run_id = fail_task.run_id
      AND s.step_slug = fail_task.step_slug
  ),
  queued_tasks AS (
    SELECT
      st.queue_name,
      st.message_id,
      pgflow.calculate_retry_delay((SELECT base_delay FROM retry_config), st.attempts_count) AS calculated_delay
    FROM pgflow.step_tasks st
    WHERE st.run_id = fail_task.run_id
      AND st.step_slug = fail_task.step_slug
      AND st.task_index = fail_task.task_index
      AND st.status = 'queued'
  )
  SELECT pgmq.set_vt(qt.queue_name, qt.message_id, qt.calculated_delay)
  FROM queued_tasks qt
  WHERE EXISTS (SELECT 1 FROM queued_tasks)
);

-- For failed tasks: archive the message grouped by the task's queue snapshot
FOR v_archive_batch IN
  SELECT
    st.queue_name,
    ARRAY_AGG(st.message_id ORDER BY st.message_id) AS ids
  FROM pgflow.step_tasks st
  WHERE st.run_id = fail_task.run_id
    AND st.step_slug = fail_task.step_slug
    AND st.task_index = fail_task.task_index
    AND st.status = 'failed'
    AND st.message_id IS NOT NULL
  GROUP BY st.queue_name
  HAVING COUNT(st.message_id) > 0
LOOP
  PERFORM pgmq.archive(v_archive_batch.queue_name, v_archive_batch.ids);
END LOOP;

return query select *
from pgflow.step_tasks st
where st.run_id = fail_task.run_id
  and st.step_slug = fail_task.step_slug
  and st.task_index = fail_task.task_index;

end;
$$;
-- Modify "start_flow" function
CREATE OR REPLACE FUNCTION "pgflow"."start_flow" ("flow_slug" text, "input" jsonb, "run_id" uuid DEFAULT NULL::uuid) RETURNS SETOF "pgflow"."runs" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_created_run pgflow.runs%ROWTYPE;
  v_root_map_count int;
begin

-- ==========================================
-- LOCK: Hold the concrete flow definition against deletion/recompilation
-- while this producer reads step definitions (#650).
-- ==========================================
perform 1 from pgflow.flows f
where f.flow_slug = start_flow.flow_slug
for key share;

-- ==========================================
-- VALIDATION: Root map array input
-- ==========================================
WITH root_maps AS (
  SELECT step_slug
  FROM pgflow.steps
  WHERE steps.flow_slug = start_flow.flow_slug
    AND steps.step_type = 'map'
    AND steps.deps_count = 0
)
SELECT COUNT(*) INTO v_root_map_count FROM root_maps;

-- If we have root map steps, validate that input is an array
IF v_root_map_count > 0 THEN
  -- First check for NULL (should be caught by NOT NULL constraint, but be defensive)
  IF start_flow.input IS NULL THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is NULL', start_flow.flow_slug;
  END IF;
  
  -- Then check if it's not an array
  IF jsonb_typeof(start_flow.input) != 'array' THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is not an array (got %)', 
      start_flow.flow_slug, jsonb_typeof(start_flow.input);
  END IF;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Create run and step states
-- ==========================================
WITH
  -- ---------- Gather flow metadata ----------
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.step_type, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
  -- ---------- Create run record ----------
  created_run AS (
    INSERT INTO pgflow.runs (run_id, flow_slug, input, remaining_steps)
    VALUES (
      COALESCE(start_flow.run_id, gen_random_uuid()),
      start_flow.flow_slug,
      start_flow.input,
      (SELECT count(*) FROM flow_steps)
    )
    RETURNING *
  ),
  -- ---------- Create step states ----------
  -- Sets initial_tasks: known for root maps, NULL for dependent maps
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps, initial_tasks)
    SELECT
      fs.flow_slug,
      (SELECT created_run.run_id FROM created_run),
      fs.step_slug,
      fs.deps_count,
      -- Updated logic for initial_tasks:
      CASE
        WHEN fs.step_type = 'map' AND fs.deps_count = 0 THEN
          -- Root map: get array length from input
          CASE
            WHEN jsonb_typeof(start_flow.input) = 'array' THEN
              jsonb_array_length(start_flow.input)
            ELSE
              1
          END
        WHEN fs.step_type = 'map' AND fs.deps_count > 0 THEN
          -- Dependent map: unknown until dependencies complete
          NULL
        ELSE
          -- Single steps: always 1 task
          1
      END
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

-- ==========================================
-- POST-CREATION ACTIONS
-- ==========================================

-- ---------- Broadcast run:started event ----------
PERFORM realtime.send(
  jsonb_build_object(
    'event_type', 'run:started',
    'run_id', v_created_run.run_id,
    'flow_slug', v_created_run.flow_slug,
    'input', v_created_run.input,
    'status', 'started',
    'remaining_steps', v_created_run.remaining_steps,
    'started_at', v_created_run.started_at
  ),
  'run:started',
  concat('pgflow:run:', v_created_run.run_id),
  false
);

-- ---------- Evaluate conditions on ready steps ----------
-- Skip steps with unmet conditions, propagate to dependents
IF NOT pgflow.cascade_resolve_conditions(v_created_run.run_id) THEN
  -- Run was failed due to a condition with when_unmet='fail'
  RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;
  RETURN;
END IF;

-- ---------- Complete taskless steps ----------
-- Handle empty array maps that should auto-complete
PERFORM pgflow.cascade_complete_taskless_steps(v_created_run.run_id);

-- ---------- Start initial steps ----------
-- Start root steps (those with no dependencies)
PERFORM pgflow.start_ready_steps(v_created_run.run_id);

-- ---------- Check for run completion ----------
-- If cascade completed all steps (zero-task flows), finalize the run
PERFORM pgflow.maybe_complete_run(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
-- Create "claim_tasks" function
CREATE FUNCTION "pgflow"."claim_tasks" ("queue_name" text, "flow_slug" text, "message_ids" bigint[], "worker_id" uuid) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_qtable text := pgmq.format_table_name(queue_name, 'q');
  v_worker record;
  v_flow_exists boolean;
  v_route_violation text;
  v_ids bigint[];
  v_bodies jsonb;
  v_classification record;
  v_claim_ids bigint[];
  v_defer_ids bigint[];
  v_terminal_ids bigint[];
  v_foreign_ids bigint[];
  v_fatal boolean := false;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_claimed_tasks jsonb;
  v_body_flow text;
  v_body_run text;
  v_body_step text;
  v_body_index text;
  v_address_task record;
  v_vt_offsets int[];
  v_updated_count int;
  v_claimed_count int;
begin
  -- Deduplicate the read batch
  select array_agg(distinct id order by id) into v_ids
  from unnest(message_ids) as u(id)
  where id is not null;

  if v_ids is null then
    return jsonb_build_object('status', 'ok', 'tasks', '[]'::jsonb, 'warnings', '[]'::jsonb);
  end if;

  -- ==========================================
  -- SUBSCRIPTION VALIDATION (before body use)
  -- ==========================================
  select w.queue_name, w.function_name
  into v_worker
  from pgflow.workers w
  where w.worker_id = claim_tasks.worker_id;

  if v_worker is null then
    -- Missing registration supplies no invented function to pause
    v_errors := v_errors || jsonb_build_object(
      'queue_name', queue_name, 'message_id', null, 'reason', 'invalid_subscription');
    perform pgflow.set_vt_batch(queue_name, v_ids, array_fill(0, array[cardinality(v_ids)]));
    return jsonb_build_object('status', 'fatal', 'tasks', '[]'::jsonb, 'errors', v_errors);
  end if;

  if v_worker.queue_name is distinct from queue_name then
    v_errors := v_errors || jsonb_build_object(
      'queue_name', queue_name, 'message_id', null, 'reason', 'invalid_subscription');
    perform pgflow.set_vt_batch(queue_name, v_ids, array_fill(0, array[cardinality(v_ids)]));
    update pgflow.worker_functions wf
    set enabled = false, updated_at = clock_timestamp()
    where wf.function_name = v_worker.function_name
      and wf.start_mode = 'http';
    return jsonb_build_object('status', 'fatal', 'tasks', '[]'::jsonb, 'errors', v_errors);
  end if;

  -- ==========================================
  -- ROUTE VALIDATION
  -- ==========================================
  select exists(select 1 from pgflow.flows f where f.flow_slug = claim_tasks.flow_slug)
    into v_flow_exists;

  select s.step_slug into v_route_violation
  from pgflow.steps s
  where s.flow_slug = claim_tasks.flow_slug
    and s.queue_name is distinct from claim_tasks.queue_name
  limit 1;

  if not v_flow_exists
     or claim_tasks.queue_name is distinct from lower(claim_tasks.flow_slug)
     or v_route_violation is not null then
    v_errors := v_errors || jsonb_build_object(
      'queue_name', queue_name, 'message_id', null, 'reason', 'wrong_route');
    perform pgflow.set_vt_batch(queue_name, v_ids, array_fill(0, array[cardinality(v_ids)]));
    update pgflow.worker_functions wf
    set enabled = false, updated_at = clock_timestamp()
    where wf.function_name = v_worker.function_name
      and wf.start_mode = 'http';
    return jsonb_build_object('status', 'fatal', 'tasks', '[]'::jsonb, 'errors', v_errors);
  end if;

  -- ==========================================
  -- READ-ONLY DISCOVERY
  -- ==========================================
  -- Read the bodies once (ordinary SQL error if the physical table is gone).
  -- Envelope inspection is identity classification only; application input
  -- JSON is never validated here.
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''msg_id'', q.msg_id, ''message'', q.message)), ''[]''::jsonb)
     from pgmq.%I q where q.msg_id = any($1)',
    v_qtable
  ) into v_bodies using v_ids;

  for v_classification in
    with pairs as (
      select
        t.run_id,
        t.step_slug,
        t.task_index,
        t.message_id,
        t.status as task_status,
        t.permanently_stalled_at,
        t.started_at,
        r.status as run_status,
        ss.status as step_status
      from pgflow.step_tasks t
      left join pgflow.runs r on r.run_id = t.run_id
      left join pgflow.step_states ss on ss.run_id = t.run_id and ss.step_slug = t.step_slug
      where t.queue_name = claim_tasks.queue_name
        and t.message_id = any(v_ids)
    )
    select
      u.id as msg_id,
      p.run_id as task_run_id,
      p.step_slug as task_step,
      p.task_index as task_index,
      p.task_status,
      p.permanently_stalled_at,
      p.started_at,
      p.run_status,
      p.step_status,
      b.msg -> 'message' as body
    from unnest(v_ids) as u(id)
    left join pairs p on p.message_id = u.id
    left join lateral jsonb_array_elements(v_bodies) b(msg) on (b.msg->>'msg_id')::bigint = u.id
    order by u.id
  loop
    v_body_flow := v_classification.body ->> 'flow_slug';
    v_body_run := v_classification.body ->> 'run_id';
    v_body_step := v_classification.body ->> 'step_slug';
    v_body_index := v_classification.body ->> 'task_index';

    if v_classification.task_run_id is not null then
      -- ==========================================
      -- EXACT DURABLE PAIR: the pair wins over the envelope
      -- ==========================================
      -- A valid address that positively identifies different work is fatal
      if v_body_flow is not null and v_body_flow is distinct from claim_tasks.flow_slug then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      elsif v_body_run is not null and v_body_run !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      elsif v_body_run is not null and v_body_run::uuid is distinct from v_classification.task_run_id then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      elsif v_classification.task_status in ('completed', 'failed', 'skipped', 'cancelled') then
        -- Terminal task: idempotent archive (archive ignores already-archived)
        v_terminal_ids := array_append(v_terminal_ids, v_classification.msg_id);
      elsif v_classification.permanently_stalled_at is not null then
        -- Permanent stall: preserve status/history, archive idempotently
        v_terminal_ids := array_append(v_terminal_ids, v_classification.msg_id);
      elsif v_classification.task_status = 'started'
            and v_classification.run_status = 'started'
            and v_classification.step_status = 'started' then
        v_defer_ids := array_append(v_defer_ids, v_classification.msg_id);
      elsif v_classification.task_status = 'queued'
            and v_classification.run_status = 'started'
            and v_classification.step_status = 'started' then
        v_claim_ids := array_append(v_claim_ids, v_classification.msg_id);
      else
        -- Active task with incompatible parent state
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      end if;
    else
      -- ==========================================
      -- NO EXACT PAIR: envelope decides
      -- ==========================================
      if v_body_flow is null and v_body_run is null and v_body_step is null and v_body_index is null then
        -- Clearly foreign: archive and warn (no bodies in diagnostics)
        v_foreign_ids := array_append(v_foreign_ids, v_classification.msg_id);
        v_warnings := v_warnings || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'foreign_message');
      else
        -- Apparently genuine pgflow work with a missing task: fatal
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      end if;
    end if;
  end loop;

  -- A live deferred task whose queue message disappeared is an ordinary
  -- integrity/visibility failure with total rollback (#656 protection)
  if not v_fatal and v_defer_ids is not null then
    perform 1
    from unnest(v_defer_ids) as d(id)
    where not exists (
      select 1 from jsonb_array_elements(v_bodies) b(msg) where (b.msg->>'msg_id')::bigint = d.id
    );
    if found then
      raise exception 'claim_tasks(): deferred live task message is missing from queue %', queue_name;
    end if;
  end if;

  -- ==========================================
  -- FATAL BRANCH: reset the whole read batch, pause, return normally
  -- ==========================================
  if v_fatal then
    perform pgflow.set_vt_batch(
      queue_name, v_ids,
      array_fill(0, array[cardinality(v_ids)])
    );
    update pgflow.worker_functions wf
    set enabled = false, updated_at = clock_timestamp()
    where wf.function_name = v_worker.function_name
      and wf.start_mode = 'http';
    return jsonb_build_object('status', 'fatal', 'tasks', '[]'::jsonb, 'errors', v_errors);
  end if;

  -- ==========================================
  -- NONFATAL BRANCH: lock, then mutate
  -- ==========================================
  -- Lock affected parent runs, step states, and task rows in the established
  -- order before touching queue rows
  perform 1
  from pgflow.runs r
  where r.run_id in (
    select t.run_id from pgflow.step_tasks t
    where t.queue_name = claim_tasks.queue_name and t.message_id = any(v_ids)
  )
  order by r.run_id
  for update;

  perform 1
  from pgflow.step_states ss
  where ss.run_id in (
    select t.run_id from pgflow.step_tasks t
    where t.queue_name = claim_tasks.queue_name and t.message_id = any(v_ids)
  )
  order by ss.run_id, ss.step_slug
  for update;

  perform 1
  from pgflow.step_tasks t
  where t.queue_name = claim_tasks.queue_name and t.message_id = any(v_ids)
  order by t.run_id, t.step_slug, t.task_index
  for update;

  -- Defer started tasks to their existing recovery deadline (effective
  -- timeout + 30s from started_at); repeated reads never move that deadline
  if v_defer_ids is not null then
    with deadlines as (
      select
        t.message_id,
        greatest(0, ceil(extract(epoch from (
          t.started_at
          + make_interval(secs => coalesce(s.opt_timeout, f.opt_timeout) + 30)
          - clock_timestamp()
        )))::integer) as vt_delay
      from pgflow.step_tasks t
      join pgflow.runs r on r.run_id = t.run_id
      join pgflow.flows f on f.flow_slug = r.flow_slug
      join pgflow.steps s on s.flow_slug = r.flow_slug and s.step_slug = t.step_slug
      where t.queue_name = claim_tasks.queue_name
        and t.message_id = any(v_defer_ids)
    )
    select array_agg(d.vt_delay order by d.message_id) into v_vt_offsets
    from (select message_id from unnest(v_defer_ids) as x(message_id)) ids
    join deadlines d on d.message_id = ids.message_id;

    perform pgflow.set_vt_batch(queue_name, v_defer_ids, v_vt_offsets);
  end if;

  -- Idempotent archival of terminal and clearly foreign groups after task locks
  if v_terminal_ids is not null then
    perform pgmq.archive(queue_name, v_terminal_ids);
  end if;
  if v_foreign_ids is not null then
    perform pgmq.archive(queue_name, v_foreign_ids);
  end if;

  -- ==========================================
  -- CLAIM: guarded update; input assembly copied from start_tasks
  -- ==========================================
  with
  task_candidates as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.queue_name,
      task.message_id
    from pgflow.step_tasks as task
    join pgflow.runs r on r.run_id = task.run_id
    where task.queue_name = claim_tasks.queue_name
      and task.message_id = any(v_claim_ids)
      and task.status = 'queued'
      and r.status = 'started'
      and exists (
        select 1
        from pgflow.step_states ss
        where ss.run_id = task.run_id
          and ss.step_slug = task.step_slug
          and ss.status = 'started'
      )
  ),
  tasks as (
    update pgflow.step_tasks
    set
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = claim_tasks.worker_id
    from task_candidates as candidate
    where step_tasks.queue_name = candidate.queue_name
      and step_tasks.message_id = candidate.message_id
      and step_tasks.status = 'queued'
    returning
      step_tasks.flow_slug,
      step_tasks.run_id,
      step_tasks.step_slug,
      step_tasks.task_index,
      step_tasks.queue_name,
      step_tasks.message_id
  ),
  runs as (
    select r.run_id, r.input
    from pgflow.runs r
    where r.run_id in (select run_id from tasks)
  ),
  deps as (
    select
      st.run_id,
      st.step_slug,
      dep.dep_slug,
      dep_state.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_states dep_state on
      dep_state.run_id = st.run_id and
      dep_state.step_slug = dep.dep_slug and
      dep_state.status = 'completed'
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output,
      count(*) as dep_count
    from deps d
    group by d.run_id, d.step_slug
  ),
  timeouts as (
    select
      task.message_id,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  ),
  visibility_reset as (
    select pgflow.set_vt_batch(
      claim_tasks.queue_name,
      array_agg(t.message_id order by t.message_id),
      array_agg(t.vt_delay order by t.message_id)
    )
    from timeouts t
  )
  select
    (select count(*) from visibility_reset),
    (select count(*) from tasks)
  into v_updated_count, v_claimed_count;

  -- Guard completeness: a claimed task without its visibility extension fails
  -- the whole statement atomically (#656)
  if v_updated_count is distinct from v_claimed_count then
    raise exception 'claim_tasks(): visibility updated % of % claimed messages',
      v_updated_count, v_claimed_count;
  end if;

  -- Build the claimed task JSON (IDs projected to text)
  with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.queue_name,
      task.message_id
    from pgflow.step_tasks task
    where task.queue_name = claim_tasks.queue_name
      and task.message_id = any(v_claim_ids)
      and task.status = 'started'
      and task.last_worker_id = claim_tasks.worker_id
  ),
  runs as (
    select r.run_id, r.input
    from pgflow.runs r
    where r.run_id in (select run_id from tasks)
  ),
  deps as (
    select
      st.run_id,
      st.step_slug,
      dep.dep_slug,
      dep_state.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_states dep_state on
      dep_state.run_id = st.run_id and
      dep_state.step_slug = dep.dep_slug and
      dep_state.status = 'completed'
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output,
      count(*) as dep_count
    from deps d
    group by d.run_id, d.step_slug
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'flow_slug', st.flow_slug,
        'run_id', st.run_id,
        'step_slug', st.step_slug,
        'task_index', st.task_index,
        'queue_name', st.queue_name,
        'msg_id', st.message_id::text,
        'input',
        case
          when step.step_type = 'map' then
            case
              when step.deps_count = 0 then jsonb_array_element(r.input, st.task_index)
              else (select jsonb_array_element(value, st.task_index) from jsonb_each(dep_out.deps_output) limit 1)
            end
          else coalesce(dep_out.deps_output, '{}'::jsonb)
        end,
        'flow_input',
        case
          when step.step_type != 'map' and step.deps_count = 0 then r.input
          else null
        end
      )
      order by st.message_id
    ),
    '[]'::jsonb
  )
  into v_claimed_tasks
  from tasks st
  join runs r on st.run_id = r.run_id
  join pgflow.steps step on
    step.flow_slug = st.flow_slug and
    step.step_slug = st.step_slug
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug;

  return jsonb_build_object(
    'status', 'ok',
    'tasks', v_claimed_tasks,
    'warnings', v_warnings
  );
end;
$$;
-- Modify "start_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."start_tasks" ("flow_slug" text, "msg_ids" bigint[], "worker_id" uuid) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_result jsonb;
  v_task jsonb;
begin
  select pgflow.claim_tasks(
    lower(start_tasks.flow_slug),
    start_tasks.flow_slug,
    start_tasks.msg_ids,
    start_tasks.worker_id
  ) into v_result;

  if v_result ->> 'status' = 'fatal' then
    raise warning 'start_tasks(): fatal claim classification for flow % (no tasks started)', start_tasks.flow_slug;
    return;
  end if;

  for v_task in select * from jsonb_array_elements(v_result -> 'tasks')
  loop
    return query
    select
      (v_task ->> 'flow_slug')::text,
      (v_task ->> 'run_id')::uuid,
      (v_task ->> 'step_slug')::text,
      v_task -> 'input',
      (v_task ->> 'msg_id')::bigint,
      (v_task ->> 'task_index')::int,
      case
        when jsonb_typeof(v_task -> 'flow_input') is distinct from 'null'
          then v_task -> 'flow_input'
        else null
      end;
  end loop;
end;
$$;
-- Drop "ensure_flow_compiled" function
DROP FUNCTION "pgflow"."ensure_flow_compiled" (text, jsonb);
-- Create "ensure_flow_compiled" function
CREATE FUNCTION "pgflow"."ensure_flow_compiled" ("flow_slug" text, "shape" jsonb, "worker_protocol" jsonb) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_is_local boolean;
  v_canonical_queue text := lower(ensure_flow_compiled.flow_slug);
BEGIN
  -- Queue-capable startup handshake (#650): the required third argument has
  -- no default and no fallback wrapper. Version 1 identifies the queue-aware
  -- startup/claim semantics. Reject missing/non-object/wrong-version values
  -- before any definition mutation.
  IF jsonb_typeof(worker_protocol) IS DISTINCT FROM 'object'
     OR worker_protocol -> 'version' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION 'Queue-capable worker protocol version 1 is required';
  END IF;
  -- Generate lock key from the canonical slug (deterministic hash).
  -- Case aliases share the lock so concurrent compilation of 'Orders' and
  -- 'orders' serializes against each other.
  v_lock_key := hashtext(lower(ensure_flow_compiled.flow_slug));

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object(
      'status', 'compiled',
      'differences', '[]'::jsonb,
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  -- 5. If shapes match: inspect the persisted route/resources before
  -- returning verified. A shape match alone does not prove a valid queue.
  IF array_length(v_differences, 1) IS NULL THEN
    PERFORM pgflow._inspect_generated_queue(
      ensure_flow_compiled.flow_slug,
      v_canonical_queue,
      true
    );
    RETURN jsonb_build_object(
      'status', 'verified',
      'differences', '[]'::jsonb,
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  END IF;

  -- 6. Shapes differ - auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  -- Local mode is the only destructive branch; production mismatches never
  -- delete data and return mismatch so worker startup fails.
  IF v_is_local THEN
    -- Preflight the entire replacement shape before any deletion so a bad
    -- late step cannot destroy old data. Deletion follows the established
    -- runtime-before-metadata lock order.
    PERFORM pgflow._validate_flow_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);

    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object(
      'status', 'recompiled',
      'differences', to_jsonb(v_differences),
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  ELSE
    -- Fail in production
    RETURN jsonb_build_object(
      'status', 'mismatch',
      'differences', to_jsonb(v_differences)
    );
  END IF;
END;
$$;
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, text[], integer, integer, integer, integer, text, jsonb, jsonb, text, text);
COMMIT;
