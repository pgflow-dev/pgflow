-- Internal generated-queue ownership helpers (#650).
--
-- These helpers inspect and provision the deterministic private queues derived
-- from persisted flow definitions. They are internal ownership machinery, not
-- routing APIs. Prohibited usage: hot-path polling/send/archive (they never
-- call these), and runtime task operations (they use task queue snapshots).

-- Inspect the physical PGMQ objects and pgflow ownership evidence for a
-- generated queue. Performs no writes; takes the pgmq.meta topology fence so
-- inspection cannot interleave with a concurrent external PGMQ create.
--
-- Returns:
--   {"state":"absent"} when no metadata and no physical objects exist
--   {"state":"present","metadata_name":<exact spelling>} when the complete
--     valid object set exists under this flow's ownership
--
-- Raises on every uncertain state: ambiguous metadata, partial objects,
-- objects without metadata, metadata without objects, malformed shape, or a
-- resource referenced/derived by another flow. p_require_existing=true
-- additionally rejects the absent state and a missing concrete definition.
create or replace function pgflow._inspect_generated_queue(
  p_flow_slug text,
  p_queue_name text,
  p_require_existing boolean
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
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

-- Provision (or verify) the canonical generated queue for a flow under the
-- canonical flow advisory lock, the concrete flow row lock, and the pgmq.meta
-- topology fence. Never adopts foreign resources and never reconstructs a
-- lost queue that live definitions/tasks still reference.
create or replace function pgflow._ensure_generated_queue(
  p_flow_slug text,
  p_queue_name text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
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
