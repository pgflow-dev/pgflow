-- Queue-aware task claim (#650).
--
-- Complete-batch classification before any mutation: every read message is
-- classified by its durable (queue_name, message_id) pair and envelope
-- identity, under the ordered parent/run, step-state, task, and queue row
-- locks, so a concurrent claim cannot change a classification after it was
-- made. Claimed tasks are built exclusively from the guarded UPDATE's
-- RETURNING rows: a task this transaction did not claim is never returned.
-- With any fatal classification, no task is claimed or archived: the complete
-- read batch is reset to immediate visibility, the registered worker's HTTP
-- function is paused, and a normal fatal JSON result is returned (never a
-- SQL error after those writes). PGMQ message IDs are cast to text before
-- JSON conversion.
create or replace function pgflow.claim_tasks(
  queue_name text,
  flow_slug text,
  message_ids bigint [],
  worker_id uuid
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
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
  v_body jsonb;
  v_body_flow text;
  v_body_run text;
  v_body_step text;
  v_body_index text;
  v_run_valid boolean;
  v_index_valid boolean;
  v_reason text;
  v_addr record;
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
    -- Missing registration supplies no invented function to pause; one
    -- diagnostic per batch member keeps every message ID non-null
    select coalesce(jsonb_agg(
      jsonb_build_object('queue_name', queue_name, 'message_id', id::text, 'reason', 'invalid_subscription')
      order by id), '[]'::jsonb)
    into v_errors
    from unnest(v_ids) as u(id);
    perform pgflow.set_vt_batch(queue_name, v_ids, array_fill(0, array[cardinality(v_ids)]));
    return jsonb_build_object('status', 'fatal', 'tasks', '[]'::jsonb, 'errors', v_errors);
  end if;

  if v_worker.queue_name is distinct from queue_name then
    select coalesce(jsonb_agg(
      jsonb_build_object('queue_name', queue_name, 'message_id', id::text, 'reason', 'invalid_subscription')
      order by id), '[]'::jsonb)
    into v_errors
    from unnest(v_ids) as u(id);
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
    select coalesce(jsonb_agg(
      jsonb_build_object('queue_name', queue_name, 'message_id', id::text, 'reason', 'wrong_route')
      order by id), '[]'::jsonb)
    into v_errors
    from unnest(v_ids) as u(id);
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
  -- Bodies are immutable in PGMQ, so reading them before the locks is safe.
  -- Envelope inspection is identity classification only; application input
  -- JSON is never validated here.
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''msg_id'', q.msg_id, ''message'', q.message)), ''[]''::jsonb)
     from pgmq.%I q where q.msg_id = any($1)',
    v_qtable
  ) into v_bodies using v_ids;

  -- ==========================================
  -- ORDERED LOCKS
  -- ==========================================
  -- Parent runs, step states, task rows, then queue rows in message-ID
  -- order: the established parent-first order shared with every other
  -- runtime operation.
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

  execute format(
    'select q.msg_id from pgmq.%I q where q.msg_id = any($1) order by q.msg_id for update',
    v_qtable
  ) using v_ids;

  -- ==========================================
  -- CLASSIFICATION (under the locks above)
  -- ==========================================
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
    v_body := v_classification.body;
    v_body_flow := v_body ->> 'flow_slug';
    v_body_run := v_body ->> 'run_id';
    v_body_step := v_body ->> 'step_slug';
    v_body_index := v_body ->> 'task_index';
    -- Safe-cast gates: only well-formed components may identify work
    v_run_valid := v_body_run is not null
      and v_body_run ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    v_index_valid := v_body_index is not null
      and v_body_index ~ '^[0-9]{1,9}$';

    if v_classification.task_run_id is not null then
      -- ==========================================
      -- EXACT DURABLE PAIR: the pair wins over the envelope. Malformed or
      -- absent components never contradict it; only a VALID address that
      -- positively identifies different work is fatal.
      -- ==========================================
      if v_body_flow is not null and v_body_flow is distinct from claim_tasks.flow_slug then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'wrong_route');
        v_fatal := true;
      elsif v_run_valid and v_body_run::uuid is distinct from v_classification.task_run_id then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      elsif v_body_step is not null and v_body_step is distinct from v_classification.task_step then
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'unsupported_work');
        v_fatal := true;
      elsif v_index_valid and (v_body_index)::int is distinct from v_classification.task_index then
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
      -- NO EXACT PAIR: key presence decides. Present-null identity keys are
      -- pgflow-shaped evidence, not foreign silence.
      -- ==========================================
      if v_body is null
         or not (v_body ? 'flow_slug' or v_body ? 'run_id'
                 or v_body ? 'step_slug' or v_body ? 'task_index') then
        -- Clearly foreign: archive and warn (no bodies in diagnostics)
        v_foreign_ids := array_append(v_foreign_ids, v_classification.msg_id);
        v_warnings := v_warnings || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', 'foreign_message');
      else
        -- Apparently genuine or ambiguous pgflow work without an exact pair:
        -- fatal. Inspect valid address components to name the reason; a
        -- malformed or null-valued component stays unsupported work.
        v_reason := 'unsupported_work';
        if v_body_flow is not null and v_body_flow is distinct from claim_tasks.flow_slug then
          v_reason := 'wrong_route';
        elsif v_run_valid then
          select r.flow_slug into v_addr
          from pgflow.runs r
          where r.run_id = v_body_run::uuid;
          if not found then
            v_reason := 'unsupported_work';
          elsif v_addr.flow_slug is distinct from claim_tasks.flow_slug then
            v_reason := 'wrong_route';
          elsif v_body_step is not null and v_index_valid then
            -- A complete valid address that belongs to this flow but to a
            -- task in another queue is wrong-route work
            if exists (
              select 1
              from pgflow.step_tasks t
              where t.run_id = v_body_run::uuid
                and t.step_slug = v_body_step
                and t.task_index = (v_body_index)::int
                and t.queue_name is distinct from claim_tasks.queue_name
            ) then
              v_reason := 'wrong_route';
            end if;
          end if;
        end if;
        v_errors := v_errors || jsonb_build_object(
          'queue_name', queue_name, 'message_id', v_classification.msg_id::text, 'reason', v_reason);
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
  -- NONFATAL BRANCH (under the locks above)
  -- ==========================================
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
  -- CLAIM: guarded update; the returned tasks are built ONLY from the
  -- UPDATE ... RETURNING rows, never from a re-query by message ID.
  -- ==========================================
  if v_claim_ids is not null then
    with
    updated as (
      update pgflow.step_tasks task
      set
        attempts_count = attempts_count + 1,
        status = 'started',
        started_at = now(),
        last_worker_id = claim_tasks.worker_id
      where task.queue_name = claim_tasks.queue_name
        and task.message_id = any(v_claim_ids)
        and task.status = 'queued'
      returning
        task.flow_slug,
        task.run_id,
        task.step_slug,
        task.task_index,
        task.queue_name,
        task.message_id
    ),
    runs as (
      select r.run_id, r.input
      from pgflow.runs r
      where r.run_id in (select run_id from updated)
    ),
    deps as (
      select
        st.run_id,
        st.step_slug,
        dep.dep_slug,
        dep_state.output as dep_output
      from updated st
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
        u.message_id,
        coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
      from updated u
      join pgflow.flows flow on flow.flow_slug = u.flow_slug
      join pgflow.steps step on step.flow_slug = u.flow_slug and step.step_slug = u.step_slug
    ),
    visibility_reset as (
      select pgflow.set_vt_batch(
        claim_tasks.queue_name,
        (select array_agg(t.message_id order by t.message_id) from timeouts t),
        (select array_agg(t.vt_delay order by t.message_id) from timeouts t)
      )
    ),
    counts as (
      select
        (select count(*) from visibility_reset) as updated_count,
        (select count(*) from updated) as claimed_count
    )
    select
      c.updated_count,
      c.claimed_count,
      coalesce((
        select jsonb_agg(
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
        )
        from updated st
        join runs r on st.run_id = r.run_id
        join pgflow.steps step on
          step.flow_slug = st.flow_slug and
          step.step_slug = st.step_slug
        left join deps_outputs dep_out on
          dep_out.run_id = st.run_id and
          dep_out.step_slug = st.step_slug
      ), '[]'::jsonb)
    into v_updated_count, v_claimed_count, v_claimed_tasks
    from counts c;

    -- Guard completeness: every task the guarded update actually claimed
    -- must have its visibility extension; otherwise the whole statement
    -- fails atomically (#656). A guarded update that claims fewer rows
    -- than classified (e.g. a concurrent skip winning the row lock, #638)
    -- simply returns only the claimed rows.
    if v_updated_count is distinct from v_claimed_count then
      raise exception 'claim_tasks(): visibility updated % of % claimed messages',
        v_updated_count, v_claimed_count;
    end if;
  else
    v_claimed_tasks := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'tasks', v_claimed_tasks,
    'warnings', v_warnings
  );
end;
$$;
