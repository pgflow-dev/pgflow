SET search_path TO pgflow;

-- universal, concistency-safe hash function
CREATE OR REPLACE FUNCTION pgflow.hash64(input text) RETURNS bigint AS $$
DECLARE hash BIGINT;
BEGIN
    RETURN ('x' || LEFT(md5(input::text), 16))::bit(64)::bigint;
END;
$$ LANGUAGE plpgsql;

-------------------------------
CREATE OR REPLACE FUNCTION pgflow.lock_run(
    run_id uuid
)
RETURNS void AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        pgflow.hash64(run_id::text)
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-------------------------------
CREATE OR REPLACE FUNCTION pgflow.lock_step_state(
    run_id uuid,
    step_slug text
)
RETURNS void AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        pgflow.hash64(run_id::text || step_slug::text)
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
