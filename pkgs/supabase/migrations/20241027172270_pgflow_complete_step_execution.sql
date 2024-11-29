SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.complete_step_execution(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
BEGIN
    UPDATE pgflow.step_executions se
    SET status = 'completed'
    WHERE se.run_id = p_run_id
    AND se.step_slug = p_step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;
