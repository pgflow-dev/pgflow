--------------------------------------------------------------------------------
-- Set VT Batch ----------------------------------------------------------------
--                                                                            --
-- Batch-update the visibility timeout (vt) of many messages                 --
-- This function implements pgflow.set_vt_batch() according to the spec      --
-- in set_vt_batch.md                                                        --
--                                                                            --
-- pgmq does not offer a batched version of set_vt, so we implemented         --
-- this function for significantly improved performance when processing       --
-- multiple messages.                                                         --
--------------------------------------------------------------------------------

create or replace function pgflow.set_vt_batch(
  queue_name TEXT,
  msg_ids BIGINT [],
  vt_offsets INTEGER []
)
returns table (
  msg_id BIGINT,
  read_ct INTEGER,
  enqueued_at TIMESTAMP WITH TIME ZONE,
  vt TIMESTAMP WITH TIME ZONE,
  message JSONB,
  headers JSONB
)
language plpgsql as
$$
DECLARE
    qtable TEXT := pgmq.format_table_name(queue_name, 'q');
    sql    TEXT;
BEGIN
    /* ---------- safety checks ---------------------------------------------------- */
    IF msg_ids IS NULL OR vt_offsets IS NULL OR array_length(msg_ids, 1) = 0 THEN
        RETURN;                    -- nothing to do, return empty set
    END IF;

    IF array_length(msg_ids, 1) IS DISTINCT FROM array_length(vt_offsets, 1) THEN
        RAISE EXCEPTION
          'msg_ids length (%) must equal vt_offsets length (%)',
          array_length(msg_ids, 1), array_length(vt_offsets, 1);
    END IF;

    /* ---------- dynamic statement ------------------------------------------------ */
    /* One UPDATE joins with the unnested arrays */
    sql := format(
        $FMT$
        WITH input (msg_id, vt_offset) AS (
            SELECT  unnest($1)::bigint
                 ,  unnest($2)::int
        )
        UPDATE pgmq.%I q
        SET    vt      = clock_timestamp() + make_interval(secs => input.vt_offset),
               read_ct = read_ct     -- no change, but keeps RETURNING list aligned
        FROM   input
        WHERE  q.msg_id = input.msg_id
        RETURNING q.msg_id,
                  q.read_ct,
                  q.enqueued_at,
                  q.vt,
                  q.message,
                  q.headers
        $FMT$,
        qtable
    );

    RETURN QUERY EXECUTE sql USING msg_ids, vt_offsets;
END;
$$;
