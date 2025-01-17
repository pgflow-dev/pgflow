create extension if not exists "pgmq" version '1.4.4';
select pgmq.create('tasks');

create schema if not exists edge_worker;
set search_path to edge_worker;

create table if not exists edge_worker.workers (
    worker_id UUID not null primary key,
    queue_name TEXT not null,
    function_name TEXT not null,
    started_at TIMESTAMPTZ not null default now(),
    stopped_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ not null default now()
);

create or replace view edge_worker.active_workers as
select *
from edge_worker.workers
where
    stopped_at is null
    and last_heartbeat_at > now() - interval '6 seconds';
create or replace view edge_worker.inactive_workers as
select *
from edge_worker.workers
where
    stopped_at is null
    and last_heartbeat_at < now() - interval '6 seconds';

create or replace function edge_worker.on_worker_started(
    queue_name TEXT,
    worker_id UUID,
    function_name TEXT
)
returns setof edge_worker.workers
as $$
declare
    p_queue_name TEXT := queue_name;
    p_worker_id UUID := worker_id;
    p_function_name TEXT := function_name;
begin
    RETURN QUERY
    INSERT INTO edge_worker.workers (queue_name, worker_id, function_name)
    VALUES (queue_name, worker_id, function_name)
    RETURNING *;
end;
$$ language plpgsql;

create or replace function edge_worker.send_heartbeat(
    worker_id UUID
) returns setof edge_worker.workers as $$
DECLARE
    p_worker_id UUID := worker_id;
BEGIN
RETURN QUERY
    UPDATE edge_worker.workers AS w
    SET last_heartbeat_at = now()
    WHERE w.worker_id = p_worker_id
    RETURNING *;
END;
$$ language plpgsql;

-- Optional: Explicit stop function
create or replace function edge_worker.on_worker_stopped(
    worker_id UUID
) returns setof edge_worker.workers as $$
declare
    p_worker_id UUID := worker_id;
BEGIN
    UPDATE edge_worker.workers AS w
    SET stopped_at = now(), last_heartbeat_at = now()
    WHERE w.worker_id = p_worker_id
    RETURNING *;
END;
$$ language plpgsql;

-- Spawn a new worker asynchronously via edge function
create or replace function edge_worker.spawn(
    function_name text
) returns integer as $$
declare
    p_function_name text := function_name;
    v_active_count integer;
begin
    SELECT COUNT(*)
    INTO v_active_count
    FROM edge_worker.active_workers AS aw
    WHERE aw.function_name = p_function_name;

    IF v_active_count < 1 THEN
        raise notice 'Spawning new worker: %', p_function_name;
        PERFORM edge_worker.call_edgefn_async(p_function_name, '');
        return 1;
    ELSE
        raise notice 'Worker Exists for queue: NOT spawning new worker for queue: %', p_function_name;
        return 0;
    END IF;
end;
$$ language plpgsql;

create function edge_worker.read_with_poll(
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
--     FROM edge_worker.workers w
--     WHERE w.status = 'running'
--     AND w.last_heartbeat_at < now() - (p_threshold_minutes || ' minutes')::interval;
-- END;
-- $$ language plpgsql;
