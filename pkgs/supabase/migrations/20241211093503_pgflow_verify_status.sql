CREATE OR REPLACE FUNCTION pgflow.verify_status(
    record record,
    allowed_status text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO pgflow
AS $$
BEGIN
    PERFORM verify_status(record, ARRAY[allowed_status]);
END;
$$;

CREATE OR REPLACE FUNCTION pgflow.verify_status(
    record record,
    allowed_statuses text []
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT (record.status = ANY(allowed_statuses)) THEN
        RAISE EXCEPTION 'Expected % status to be one of % but got ''%''',
            pg_typeof(record)::text,
            allowed_statuses,
            record.status;
    END IF;
END;
$$;
