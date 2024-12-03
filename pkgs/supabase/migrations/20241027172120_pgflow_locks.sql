CREATE SCHEMA IF NOT EXISTS pgflow_locks;
SET search_path TO pgflow_locks;

--------------------------------------------------------------------------
------------------ TODO: fix me, UNSECURE --------------------------------
--------------------------------------------------------------------------
GRANT USAGE ON SCHEMA pgflow_locks TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgflow_locks TO anon,
authenticated,
service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow_locks TO anon,
authenticated,
service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow_locks TO anon,
authenticated,
service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow_locks
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow_locks
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow_locks
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- universal, concistency-safe hash function
CREATE OR REPLACE FUNCTION pgflow_locks.hash64(input text) RETURNS bigint AS $$
DECLARE hash BIGINT;
BEGIN
    RETURN ('x' || LEFT(md5(input::text), 16))::bit(64)::bigint;
END;
$$ LANGUAGE plpgsql;

-------------------------------
-- required to make sure we check if dependant steps are ready in serial,
-- so one of the dependencies can observe all deps for dependant
-- being ready, so it can start the dependant
CREATE OR REPLACE FUNCTION pgflow_locks.complete_steps_in_serial(
    run_id uuid
)
RETURNS void AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        pgflow_locks.hash64('complete_steps_in_serial' || run_id::text)
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-------------------------------
-- required so the start_step_exeuction() call in edge function
-- can wait for the step to be ready, and it is triggered via http request
-- from withih the start_step transaction, so it often fails because it does
-- not see the step state commited yet

-- TODO: remove this when we hide complete_step() as private API and
--       and expose it only via complete_step_execution()
CREATE OR REPLACE FUNCTION pgflow_locks.wait_for_start_step_to_commit(
    run_id uuid,
    step_slug text
)
RETURNS void AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        pgflow_locks.hash64('wait_for_start_step_to_commit' || run_id::text || step_slug::text)
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
