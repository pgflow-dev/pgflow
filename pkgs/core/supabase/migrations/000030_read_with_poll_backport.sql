--------------------------------------------------------------------------------
-- Read With Poll --------------------------------------------------------------
--                                                                            --
-- This is a backport of the pgmq.read_with_poll function from version 1.5.0  --
-- It is required because it fixes a bug with high CPU usage and Supabase     --
-- is still using version 1.4.4.                                              --
--                                                                            --
-- It is slightly modified (removed headers which are not available in 1.4.1) --
--                                                                            --
-- This will be removed once Supabase upgrades to 1.5.0 or higher.            --
--------------------------------------------------------------------------------
create function pgflow.read_with_poll(
  queue_name TEXT,
  vt INTEGER,
  qty INTEGER,
  max_poll_seconds INTEGER default 5,
  poll_interval_ms INTEGER default 100,
  conditional JSONB default '{}'
)
returns setof PGMQ.MESSAGE_RECORD as $$
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

