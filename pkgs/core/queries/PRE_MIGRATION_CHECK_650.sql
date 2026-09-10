-- ================================================================================
-- PRE-MIGRATION CHECK for the queue identity migration (#650)
-- ================================================================================
-- Purpose: read-only audit of a pgflow 0.16.0 database before the queue
--          identity upgrade. Reports every definition, task pair, queue
--          resource, and installed pruning helper the upgrade must inspect.
-- When to run: BEFORE applying the migration, while writers are paused.
-- Requirements: PostgreSQL with pgflow at 0.16.0 and PGMQ 1.5.1.
--
-- What to do with output:
--   - severity=info rows only? The locked migration preflight will recheck
--     everything; this stale report never replaces it.
--   - severity=error rows? Resolve the exact names/keys manually first.
--     The migration never renames, merges, deletes, or repairs anything.
--
-- This script performs no writes: REPEATABLE READ READ ONLY + ROLLBACK.
-- It depends on no new pgflow function or column. Paste into any SQL client.
-- ================================================================================

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

DO $audit$
declare
  v_issue record;
  v_queue text;
  v_metadata_name text;
  v_meta_count int;
  v_meta_row pgmq.meta%ROWTYPE;
  v_qtable text;
  v_atable text;
  v_seq text;
  v_q_oid oid;
  v_a_oid oid;
  v_seq_oid oid;
  v_ext_oid oid;
  v_bad text;
  v_count text;
  v_samples text;
  v_procedure regprocedure;
  v_prosrc_md5 text;
  -- md5(prosrc) of the stock 0.16.0 helper frozen in the upgrade fixture.
  v_stock_prune_md5 constant text := 'd87aba89f910570d5a3c17ba1243eb76';
begin
  -- ==========================================================================
  -- 1. Incompatible flow/step definitions under the new slug rules
  -- ==========================================================================
  for v_issue in
    select 'flow'::text as kind, f.flow_slug, null::text as step_slug,
           'leading_underscore'::text as code
    from pgflow.flows f where left(f.flow_slug, 1) = '_'
    union all
    select 'flow', f.flow_slug, null, 'trailing_underscore'
    from pgflow.flows f where right(f.flow_slug, 1) = '_'
    union all
    select 'flow', f.flow_slug, null, 'double_underscore'
    from pgflow.flows f where position('__' in f.flow_slug) > 0
    union all
    select 'flow', f.flow_slug, null, 'invalid_slug'
    from pgflow.flows f
    where f.flow_slug !~ '^[a-zA-Z][a-zA-Z0-9_]*$'
       or length(f.flow_slug) > 128
       or f.flow_slug = 'run'
    union all
    select 'step', s.flow_slug, s.step_slug, 'leading_underscore'
    from pgflow.steps s where left(s.step_slug, 1) = '_'
    union all
    select 'step', s.flow_slug, s.step_slug, 'trailing_underscore'
    from pgflow.steps s where right(s.step_slug, 1) = '_'
    union all
    select 'step', s.flow_slug, s.step_slug, 'double_underscore'
    from pgflow.steps s where position('__' in s.step_slug) > 0
    union all
    select 'step', s.flow_slug, s.step_slug, 'invalid_slug'
    from pgflow.steps s
    where s.step_slug !~ '^[a-zA-Z][a-zA-Z0-9_]*$'
       or length(s.step_slug) > 128
       or s.step_slug = 'run'
  loop
    raise notice '%', jsonb_build_object(
      'severity', 'error',
      'code', v_issue.code,
      'flow_slug', v_issue.flow_slug,
      'step_slug', v_issue.step_slug,
      'hint', 'Resolve this exact definition before upgrade; the migration does not rename or delete it'
    )::text;
  end loop;

  -- ==========================================================================
  -- 2. Case-only conflicts (exact spelling of every member is reported)
  -- ==========================================================================
  for v_issue in
    select f.flow_slug, null::text as step_slug, 'case_conflict_flow'::text as code
    from pgflow.flows f
    where exists (
      select 1 from pgflow.flows other
      where other.flow_slug <> f.flow_slug
        and lower(other.flow_slug) = lower(f.flow_slug)
    )
    union all
    select s.flow_slug, s.step_slug, 'case_conflict_step'
    from pgflow.steps s
    where exists (
      select 1 from pgflow.steps other
      where other.flow_slug = s.flow_slug
        and other.step_slug <> s.step_slug
        and lower(other.step_slug) = lower(s.step_slug)
    )
  loop
    raise notice '%', jsonb_build_object(
      'severity', 'error',
      'code', v_issue.code,
      'flow_slug', v_issue.flow_slug,
      'step_slug', v_issue.step_slug,
      'hint', 'A differently spelled flow/step shares this canonical queue; resolve exact spelling manually (no automatic rename)'
    )::text;
  end loop;

  -- ==========================================================================
  -- 3. Denormalized runtime ownership consistency (before trusting backfill)
  -- ==========================================================================
  select count(*)::text into v_count
  from pgflow.step_tasks t
  join pgflow.runs r on r.run_id = t.run_id
  where r.flow_slug is distinct from t.flow_slug;
  if v_count <> '0' then
    raise notice '%', jsonb_build_object(
      'severity', 'error',
      'code', 'task_run_flow_mismatch',
      'count', v_count,
      'samples', (
        select coalesce(string_agg(t.run_id || ':' || t.step_slug || '#' || t.task_index, ', '), '')
        from (
          select t.run_id, t.step_slug, t.task_index
          from pgflow.step_tasks t
          join pgflow.runs r on r.run_id = t.run_id
          where r.flow_slug is distinct from t.flow_slug
          limit 20
        ) t
      ),
      'hint', 'step_tasks disagree with their run flow_slug; resolve denormalized ownership manually'
    )::text;
  end if;

  -- ==========================================================================
  -- 4. Prospective duplicate (queue, message) pairs — all tasks, not only
  --    active runs
  -- ==========================================================================
  for v_issue in
    select lower(t.flow_slug) as queue_name, t.message_id::text as message_id,
           count(*)::text as count
    from pgflow.step_tasks t
    where t.message_id is not null
    group by lower(t.flow_slug), t.message_id
    having count(*) > 1
  loop
    raise notice '%', jsonb_build_object(
      'severity', 'error',
      'code', 'duplicate_queue_message_pair',
      'queue_name', v_issue.queue_name,
      'count', v_issue.count,
      'samples', v_issue.message_id,
      'hint', 'Distinct old tasks share a prospective queue/message pair; resolve manually (no automatic merge)'
    )::text;
  end loop;

  -- ==========================================================================
  -- 5. Backfill overview per flow (counts + bounded samples, informational)
  -- ==========================================================================
  for v_issue in
    select f.flow_slug,
           lower(f.flow_slug) as queue_name,
           (select count(*)::text from pgflow.steps s where s.flow_slug = f.flow_slug) as steps,
           (select count(*)::text from pgflow.step_tasks t where t.flow_slug = f.flow_slug) as tasks,
           (select count(*)::text from pgflow.step_tasks t
            where t.flow_slug = f.flow_slug and t.message_id is null) as null_message_tasks,
           (select coalesce(string_agg(
              r.run_id || ':' || r.step_slug || '#' || r.task_index || '->' || coalesce(r.message_id::text, 'NULL'), ', '), '')
            from (
              select t.run_id, t.step_slug, t.task_index, t.message_id
              from pgflow.step_tasks t
              where t.flow_slug = f.flow_slug and t.message_id is null
              limit 20
            ) r) as null_samples,
           (select coalesce(string_agg(
              r.run_id || ':' || r.step_slug || '#' || r.task_index || '->' || r.message_id::text, ', '), '')
            from (
              select t.run_id, t.step_slug, t.task_index, t.message_id
              from pgflow.step_tasks t
              where t.flow_slug = f.flow_slug and t.message_id is not null
              order by t.run_id, t.step_slug, t.task_index
              limit 20
            ) r) as task_samples
    from pgflow.flows f
    order by f.flow_slug
  loop
    raise notice '%', jsonb_build_object(
      'severity', 'info',
      'code', 'backfill_overview',
      'flow_slug', v_issue.flow_slug,
      'queue_name', v_issue.queue_name,
      'count', v_issue.tasks,
      'samples', jsonb_build_object(
        'steps', v_issue.steps,
        'tasks', v_issue.tasks,
        'null_message_tasks', v_issue.null_message_tasks,
        'null_task_keys', v_issue.null_samples,
        'task_keys', v_issue.task_samples
      ),
      'hint', 'Every step/task backfills queue_name to lower(flow_slug); NULL message IDs stay NULL'
    )::text;
  end loop;

  -- ==========================================================================
  -- 6. Generated queue resources for every persisted flow definition
  --    (global pgmq metadata lookup; only validated pgflow candidates are
  --    inspected — never unrelated application queues)
  -- ==========================================================================
  for v_queue in select distinct lower(f.flow_slug) from pgflow.flows f order by 1
  loop
    if length(v_queue) > 47 or v_queue !~ '^[a-z][a-z0-9_]*$' then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'invalid_canonical_queue_name',
        'queue_name', v_queue,
        'hint', 'Generated queue name must be lowercase, at most 47 characters, starting with a letter'
      )::text;
      continue;
    end if;

    select count(*), min(m.queue_name) into v_meta_count, v_metadata_name
    from pgmq.meta m
    where lower(m.queue_name) = v_queue;

    v_qtable := pgmq.format_table_name(v_queue, 'q');
    v_atable := pgmq.format_table_name(v_queue, 'a');
    v_seq := v_qtable || '_msg_id_seq';

    if v_meta_count = 0 then
      if to_regclass('pgmq.' || v_qtable) is not null
         or to_regclass('pgmq.' || v_atable) is not null
         or to_regclass('pgmq.' || v_seq) is not null then
        raise notice '%', jsonb_build_object(
          'severity', 'error',
          'code', 'objects_without_metadata',
          'queue_name', v_queue,
          'hint', 'Physical queue objects exist without pgmq metadata; resolve ownership manually (the migration repairs nothing)'
        )::text;
      else
        raise notice '%', jsonb_build_object(
          'severity', 'error',
          'code', 'queue_absent',
          'queue_name', v_queue,
          'hint', 'Flow definition has no generated queue resources; the migration does not reconstruct a lost live queue'
        )::text;
      end if;
      continue;
    end if;

    if v_meta_count > 1 then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'ambiguous_metadata',
        'queue_name', v_queue,
        'count', v_meta_count::text,
        'hint', 'Multiple pgmq metadata spellings resolve to one canonical queue; remove the wrong spelling manually'
      )::text;
      continue;
    end if;

    if to_regclass('pgmq.' || v_qtable) is null
       or to_regclass('pgmq.' || v_atable) is null
       or to_regclass('pgmq.' || v_seq) is null then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'incomplete_queue_objects',
        'queue_name', v_queue,
        'samples', format('metadata=%s q=%s a=%s seq=%s',
          v_metadata_name,
          to_regclass('pgmq.' || v_qtable) is not null,
          to_regclass('pgmq.' || v_atable) is not null,
          to_regclass('pgmq.' || v_seq) is not null),
        'hint', 'Queue metadata exists but q/a/sequence objects are incomplete; resolve manually (no repair, no drop)'
      )::text;
      continue;
    end if;

    -- Physical shape, index, sequence-dependency, and extension-membership
    -- audit: the same read-only catalog contract the migration preflight
    -- enforces, mirroring the complete per-column contract of
    -- _inspect_generated_queue (0070_functions_generated_queues.sql)
    -- including explicit missing-column rejection. Problems are reported
    -- (never repaired) with bounded samples.
    select * into v_meta_row from pgmq.meta m where lower(m.queue_name) = v_queue;
    v_q_oid := to_regclass(format('pgmq.%I', v_qtable));
    v_a_oid := to_regclass(format('pgmq.%I', v_atable));
    v_seq_oid := to_regclass(format('pgmq.%I', v_seq));
    select e.oid into v_ext_oid from pg_extension e where e.extname = 'pgmq';

    select string_agg(problem, '; ') into v_bad
    from (
      select 'queue table is not an ordinary permanent table' as problem
      from pg_class c
      where c.oid = v_q_oid and (c.relkind <> 'r' or c.relpersistence <> 'p')
      union all
      select 'archive table is not an ordinary permanent table'
      from pg_class c
      where c.oid = v_a_oid and (c.relkind <> 'r' or c.relpersistence <> 'p')
      union all
      select 'queue msg_id must be a non-null bigint generated-always identity'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'msg_id'
        and (a.atttypid <> 'int8'::regtype or not a.attnotnull or a.attidentity <> 'a')
      union all
      select 'queue table is missing its msg_id bigint identity column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'msg_id' and a.attnum > 0)
      union all
      select 'queue msg_id has no single-column primary key'
      where not exists (
        select 1 from pg_index i
        where i.indrelid = v_q_oid and i.indisprimary and i.indisvalid
          and i.indnkeyatts = 1
          and i.indkey[0] = (select a.attnum from pg_attribute a
                             where a.attrelid = v_q_oid and a.attname = 'msg_id')
      )
      union all
      select 'queue table has no valid usable single-column index on vt'
      where not exists (
        select 1
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = v_q_oid and i.indisvalid and i.indisready
          and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1
          and a.attname = 'vt'
      )
      union all
      select 'queue read_ct must be a non-null integer'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'read_ct'
        and (a.atttypid <> 'int4'::regtype or not a.attnotnull)
      union all
      select 'queue table is missing its read_ct column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'read_ct' and a.attnum > 0)
      union all
      select 'queue enqueued_at must be a non-null timestamptz'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'enqueued_at'
        and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
      union all
      select 'queue table is missing its enqueued_at column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'enqueued_at' and a.attnum > 0)
      union all
      select 'queue vt must be a non-null timestamptz'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'vt'
        and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
      union all
      select 'queue table is missing its vt column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'vt' and a.attnum > 0)
      union all
      select 'queue message must be jsonb'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'message'
        and a.atttypid <> 'jsonb'::regtype
      union all
      select 'queue table is missing its message column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'message' and a.attnum > 0)
      union all
      select 'queue headers must be jsonb'
      from pg_attribute a
      where a.attrelid = v_q_oid and a.attname = 'headers'
        and a.atttypid <> 'jsonb'::regtype
      union all
      select 'queue table is missing its headers column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_q_oid and a.attname = 'headers' and a.attnum > 0)
      union all
      select 'archive msg_id must be a non-null bigint primary key without identity generator'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'msg_id'
        and (a.atttypid <> 'int8'::regtype or not a.attnotnull or a.attidentity <> '')
      union all
      select 'archive table is missing its msg_id bigint column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'msg_id' and a.attnum > 0)
      union all
      select 'archive msg_id has no single-column primary key'
      where not exists (
        select 1 from pg_index i
        where i.indrelid = v_a_oid and i.indisprimary and i.indisvalid
          and i.indnkeyatts = 1
          and i.indkey[0] = (select a.attnum from pg_attribute a
                             where a.attrelid = v_a_oid and a.attname = 'msg_id')
      )
      union all
      select 'archive read_ct must be a non-null integer'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'read_ct'
        and (a.atttypid <> 'int4'::regtype or not a.attnotnull)
      union all
      select 'archive table is missing its read_ct column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'read_ct' and a.attnum > 0)
      union all
      select 'archive enqueued_at must be a non-null timestamptz'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'enqueued_at'
        and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
      union all
      select 'archive table is missing its enqueued_at column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'enqueued_at' and a.attnum > 0)
      union all
      select 'archive archived_at must be a non-null timestamptz'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'archived_at'
        and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
      union all
      select 'archive table is missing its archived_at column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'archived_at' and a.attnum > 0)
      union all
      select 'archive vt must be a non-null timestamptz'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'vt'
        and (a.atttypid <> 'timestamptz'::regtype or not a.attnotnull)
      union all
      select 'archive table is missing its vt column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'vt' and a.attnum > 0)
      union all
      select 'archive message must be jsonb'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'message'
        and a.atttypid <> 'jsonb'::regtype
      union all
      select 'archive table is missing its message column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'message' and a.attnum > 0)
      union all
      select 'archive headers must be jsonb'
      from pg_attribute a
      where a.attrelid = v_a_oid and a.attname = 'headers'
        and a.atttypid <> 'jsonb'::regtype
      union all
      select 'archive table is missing its headers column'
      where not exists (select 1 from pg_attribute a
                        where a.attrelid = v_a_oid and a.attname = 'headers' and a.attnum > 0)
      union all
      select 'archive table has no valid usable single-column index on archived_at'
      where not exists (
        select 1
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = v_a_oid and i.indisvalid and i.indisready
          and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1
          and a.attname = 'archived_at'
      )
      union all
      select 'sequence must be a bigint sequence'
      from pg_sequence s
      where s.seqrelid = v_seq_oid
        and s.seqtypid <> 'int8'::regtype
      union all
      select 'sequence is missing (the named relation is not a sequence or does not exist)'
      where not exists (select 1 from pg_sequence s where s.seqrelid = v_seq_oid)
      union all
      select 'sequence is not associated with queue msg_id'
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
      union all
      select 'metadata flags disagree with physical shape (partitioned/unlogged)'
      where v_meta_row.is_partitioned or v_meta_row.is_unlogged
      union all
      select 'q/a tables or sequence are not members of the installed pgmq extension'
      where v_ext_oid is not null and (
        not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = v_q_oid and d.objsubid = 0
            and d.refclassid = 'pg_extension'::regclass
            and d.refobjid = v_ext_oid and d.deptype = 'e'
        ) or not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = v_a_oid and d.objsubid = 0
            and d.refclassid = 'pg_extension'::regclass
            and d.refobjid = v_ext_oid and d.deptype = 'e'
        ) or not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = v_seq_oid and d.objsubid = 0
            and d.refclassid = 'pg_extension'::regclass
            and d.refobjid = v_ext_oid and d.deptype = 'e'
        )
      )
    ) problems;

    if v_bad is not null then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'malformed_queue_objects',
        'queue_name', v_queue,
        'samples', v_bad,
        'hint', 'Queue objects fail the physical/dependency/extension contract; resolve manually (the migration repairs nothing)'
      )::text;
      continue;
    end if;

    -- Active queue rows without a matching exact task identity, including
    -- non-visible messages (vt > now() does not exempt them). A malformed
    -- relation shape reports instead of failing the audit.
    begin
      execute format(
        'select count(*)::text from pgmq.%I q
         where not exists (
           select 1 from pgflow.step_tasks t
           where lower(t.flow_slug) = $1 and t.message_id = q.msg_id
         )', v_qtable)
      into v_count using v_queue;
    exception when others then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'queue_inspect_error',
        'queue_name', v_queue,
        'samples', sqlerrm || ' (table: ' || v_qtable || ')',
        'hint', 'The queue relation has an unexpected shape; inspect it manually before upgrade'
      )::text;
      continue;
    end;

    if v_count <> '0' then
      begin
        execute format(
          'select coalesce(string_agg(x.k, '', ''), '''')
           from (select q.msg_id::text as k from pgmq.%I q
                 where not exists (
                   select 1 from pgflow.step_tasks t
                   where lower(t.flow_slug) = $1 and t.message_id = q.msg_id
                 )
                 order by q.msg_id limit 20) x', v_qtable)
        into v_samples using v_queue;
      exception when others then
        v_samples := null;
      end;
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'unmatched_active_message',
        'queue_name', v_queue,
        'count', v_count,
        'samples', v_samples,
        'hint', 'Active queue messages without a matching exact task identity; resolve orphan messages manually before upgrade'
      )::text;
    end if;

    -- Matched messages whose envelopes identify different work than their
    -- durable task identity: a valid contradicting address is corruption the
    -- migration must reject, so the audit reports it before upgrade.
    begin
      execute format(
        'select count(*)::text from pgmq.%I q
         join pgflow.step_tasks t
           on lower(t.flow_slug) = $1 and t.message_id = q.msg_id
         where (q.message ->> ''flow_slug'') is not null
           and (q.message ->> ''flow_slug'') is distinct from t.flow_slug
           or ((q.message ->> ''run_id'') ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
               and (q.message ->> ''run_id'')::uuid is distinct from t.run_id)
           or (q.message ->> ''step_slug'') is not null
           and (q.message ->> ''step_slug'') is distinct from t.step_slug
           or ((q.message ->> ''task_index'') ~ ''^[0-9]{1,9}$''
               and (q.message ->> ''task_index'')::int is distinct from t.task_index)',
        v_qtable)
      into v_count using v_queue;
    exception when others then
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'queue_inspect_error',
        'queue_name', v_queue,
        'samples', sqlerrm || ' (table: ' || v_qtable || ')',
        'hint', 'The queue relation has an unexpected shape; inspect it manually before upgrade'
      )::text;
      continue;
    end;

    if v_count <> '0' then
      begin
        execute format(
          'select coalesce(string_agg(x.k, '', ''), '''')
           from (select q.msg_id::text as k from pgmq.%I q
                 join pgflow.step_tasks t
                   on lower(t.flow_slug) = $1 and t.message_id = q.msg_id
                 where (q.message ->> ''flow_slug'') is not null
                   and (q.message ->> ''flow_slug'') is distinct from t.flow_slug
                   or ((q.message ->> ''run_id'') ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                       and (q.message ->> ''run_id'')::uuid is distinct from t.run_id)
                   or (q.message ->> ''step_slug'') is not null
                   and (q.message ->> ''step_slug'') is distinct from t.step_slug
                   or ((q.message ->> ''task_index'') ~ ''^[0-9]{1,9}$''
                       and (q.message ->> ''task_index'')::int is distinct from t.task_index)
                 order by q.msg_id limit 20) x', v_qtable)
        into v_samples using v_queue;
      exception when others then
        v_samples := null;
      end;
      raise notice '%', jsonb_build_object(
        'severity', 'error',
        'code', 'envelope_contradiction',
        'queue_name', v_queue,
        'count', v_count,
        'samples', v_samples,
        'hint', 'Matched active messages carry envelopes that identify different work than their task rows; resolve manually before upgrade (no bodies are shown)'
      )::text;
    end if;
  end loop;

  -- ==========================================================================
  -- 7. Installed pruning helper (upgrade action, never auto-replaced)
  -- ==========================================================================
  v_procedure := to_regprocedure('pgflow.prune_data_older_than(interval)');
  if v_procedure is null then
    raise notice '%', jsonb_build_object(
      'severity', 'info',
      'code', 'pruning_helper_absent',
      'hint', 'No installed pgflow.prune_data_older_than(interval); nothing to replace or adapt'
    )::text;
  else
    select md5(p.prosrc) into v_prosrc_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow'
      and p.proname = 'prune_data_older_than';
    raise notice '%', jsonb_build_object(
      'severity', 'warning',
      'code', case when v_prosrc_md5 = v_stock_prune_md5 then 'pruning_helper_stock'
                   else 'pruning_helper_customized' end,
      'samples', jsonb_build_object(
        'md5_prosrc', v_prosrc_md5,
        'stock_0_16_0_md5', v_stock_prune_md5
      ),
      'hint', case when v_prosrc_md5 = v_stock_prune_md5
        then 'Stock 0.16.0 helper detected: replace it explicitly after the migration; the migration never overwrites it'
        else 'Customized helper detected: adapt it manually to queue snapshots after the migration; the migration never overwrites it' end
    )::text;
  end if;

  raise notice '%', jsonb_build_object(
    'severity', 'info',
    'code', 'audit_complete',
    'hint', 'This report is a point-in-time snapshot taken while writers are paused; the locked migration preflight rechecks everything and can still fail on new activity'
  )::text;
end
$audit$;

ROLLBACK;
