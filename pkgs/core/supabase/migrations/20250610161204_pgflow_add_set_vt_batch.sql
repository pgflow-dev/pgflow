-- Create "set_vt_batch" function
CREATE FUNCTION "pgflow"."set_vt_batch" ("queue_name" text, "msg_ids" bigint[], "vt_offsets" integer[]) RETURNS SETOF pgmq.message_record LANGUAGE plpgsql AS $$
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
                  q.message
        $FMT$,
        qtable
    );

    RETURN QUERY EXECUTE sql USING msg_ids, vt_offsets;
END;
$$;
