SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.fail_step_execution(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID AS $$
#variable_conflict use_column
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
BEGIN
    UPDATE pgflow.step_executions se
    SET status = 'failed'
    WHERE run_id = p_run_id
    AND step_slug = p_step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;
