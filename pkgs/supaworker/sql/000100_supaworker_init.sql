create extension if not exists "pgmq" version '1.4.4';
select pgmq.create('pgflow');

create schema if not exists supaworker;
set search_path to supaworker;

create table if not exists supaworker.workers (
    worker_id UUID not null default gen_random_uuid() primary key,
    queue_name TEXT not null,
    edge_fn_name text,
    started_at TIMESTAMPTZ not null default now(),
    stopped_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ not null default now()
);

create or replace view supaworker.active_workers as
select *
from supaworker.workers
where
    stopped_at is null
    and last_heartbeat_at > now() - interval '6 seconds';
create or replace view supaworker.inactive_workers as
select *
from supaworker.workers
where
    stopped_at is null
    and last_heartbeat_at < now() - interval '6 seconds';

create or replace function supaworker.on_worker_started(
    queue_name TEXT
)
returns setof supaworker.workers
as $$
declare
    p_queue_name TEXT := queue_name;
begin
    RETURN QUERY
    INSERT INTO supaworker.workers (queue_name)
    VALUES (queue_name)
    RETURNING *;
end;
$$ language plpgsql;

create or replace function supaworker.send_heartbeat(
    worker_id UUID,
    function_name text default null
) returns setof supaworker.WORKERS as $$
DECLARE
    p_worker_id UUID := worker_id;
    p_function_name text := function_name;
BEGIN
RETURN QUERY
UPDATE supaworker.workers AS w
SET 
    last_heartbeat_at = now(),
    edge_fn_name = CASE 
        WHEN p_function_name IS NOT NULL AND p_function_name <> '' THEN p_function_name 
        ELSE edge_fn_name 
    END
    WHERE w.worker_id = p_worker_id
    RETURNING *;
END;
$$ language plpgsql;

-- Optional: Explicit stop function
create or replace function supaworker.on_worker_stopped(
    worker_id UUID
) returns VOID as $$
declare
    p_worker_id UUID := worker_id;
BEGIN
    UPDATE supaworker.workers AS w
    SET stopped_at = now(), last_heartbeat_at = now()
    WHERE w.worker_id = p_worker_id
    RETURNING *;
END;
$$ language plpgsql;

-- Spawn a new worker asynchronously via edge function
create or replace function supaworker.spawn(
    queue_name text
) returns integer as $$
declare
    p_queue_name text := queue_name;
    v_active_count integer;
begin
    SELECT COUNT(*)
    INTO v_active_count
    FROM supaworker.active_workers AS aw
    WHERE aw.queue_name = p_queue_name;

    IF v_active_count < 1 THEN
        raise notice 'Spawning new worker for queue: %', p_queue_name;
        PERFORM supaworker.call_edgefn_async('pgflow-worker-2', p_queue_name);
        return 1;
    ELSE
        raise notice 'Worker Exists for queue: NOT spawning new worker for queue: %', p_queue_name;
        return 0;
    END IF;
end;
$$ language plpgsql;

create function supaworker.read_with_poll(
    queue_name TEXT,
    vt INTEGER,
    qty INTEGER,
    max_poll_seconds INTEGER default 5,
    poll_interval_ms INTEGER default 100,
    conditional JSONB default '{}'
)
returns setof pgmq.message_record as $$
DECLARE
    r pgmq.message_record;
    stop_at TIMESTAMP;
    sql TEXT;
    qtable TEXT := pgmq.format_table_name(queue_name, 'q');
BEGIN
    stop_at := clock_timestamp() + make_interval(secs => max_poll_seconds);
    LOOP
      IF (SELECT clock_timestamp() >= stop_at) THEN
        RETURN;
      END IF;

      sql := FORMAT(
          $QUERY$
          WITH cte AS
          (
              SELECT msg_id
              FROM pgmq.%I
              WHERE vt <= clock_timestamp() AND CASE
                  WHEN %L != '{}'::jsonb THEN (message @> %2$L)::integer
                  ELSE 1
              END = 1
              ORDER BY msg_id ASC
              LIMIT $1
              FOR UPDATE SKIP LOCKED
          )
          UPDATE pgmq.%I m
          SET
              vt = clock_timestamp() + %L,
              read_ct = read_ct + 1
          FROM cte
          WHERE m.msg_id = cte.msg_id
          RETURNING m.msg_id, m.read_ct, m.enqueued_at, m.vt, m.message;
          $QUERY$,
          qtable, conditional, qtable, make_interval(secs => vt)
      );

      FOR r IN
        EXECUTE sql USING qty
      LOOP
        RETURN NEXT r;
      END LOOP;
      IF FOUND THEN
        RETURN;
      ELSE
        PERFORM pg_sleep(poll_interval_ms::numeric / 1000);
      END IF;
    END LOOP;
END;
$$ language plpgsql;


-- Helper function to identify stale workers
-- create or replace function get_stale_workers(
--     p_threshold_minutes INT default 5
-- ) returns table (
--     worker_id TEXT,
--     last_heartbeat_at TIMESTAMPTZ,
--     minutes_since_heartbeat DOUBLE PRECISION
-- ) as $$
-- BEGIN
--     RETURN QUERY
--     SELECT
--         w.worker_id,
--         w.last_heartbeat_at,
--         EXTRACT(EPOCH FROM (now() - w.last_heartbeat_at))/60 AS minutes_since_heartbeat
--     FROM supaworker.workers w
--     WHERE w.status = 'running'
--     AND w.last_heartbeat_at < now() - (p_threshold_minutes || ' minutes')::interval;
-- END;
-- $$ language plpgsql;
