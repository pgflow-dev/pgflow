-- Migration tested 2025-11-02:
-- Successfully verified that this migration fails on pgmq 1.4.4 (Supabase CLI < 2.50.3)
-- with clear error message guiding users to upgrade pgmq to 1.5.0+
--
-- Compatibility check: Ensure pgmq.message_record has headers column (pgmq 1.5.0+)
DO $$
DECLARE
    has_headers BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = t.typrelid
        WHERE n.nspname = 'pgmq'
          AND t.typname = 'message_record'
          AND a.attname = 'headers'
          AND a.attnum > 0
          AND NOT a.attisdropped
    ) INTO has_headers;

    IF NOT has_headers THEN
        RAISE EXCEPTION E'INCOMPATIBLE PGMQ VERSION DETECTED\n\n'
            'This migration is part of pgflow 0.8.0+, which requires pgmq 1.5.0 or higher.\n'
            'The pgmq.message_record type is missing the "headers" column, which indicates you are running pgmq < 1.5.0.\n\n'
            'pgflow 0.8.0+ is NOT compatible with pgmq versions below 1.5.0.\n\n'
            'Action required:\n'
            '  - If using Supabase: Ensure you are running a recent version that includes pgmq 1.5.0+\n'
            '  - If self-hosting: Upgrade pgmq to version 1.5.0 or higher before running this migration\n\n'
            'Migration aborted to prevent runtime failures.';
    END IF;
END $$;

-- Modify "set_vt_batch" function
-- Must drop first because we're changing the return type from SETOF to TABLE
DROP FUNCTION IF EXISTS "pgflow"."set_vt_batch"(text, bigint[], integer[]);
CREATE FUNCTION "pgflow"."set_vt_batch" (
    "queue_name" text,
    "msg_ids" bigint[],
    "vt_offsets" integer[]
)
RETURNS TABLE(
    msg_id bigint,
    read_ct integer,
    enqueued_at timestamp with time zone,
    vt timestamp with time zone,
    message jsonb,
    headers jsonb
)
LANGUAGE plpgsql AS $$
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
-- Drop "read_with_poll" function
DROP FUNCTION "pgflow"."read_with_poll";
