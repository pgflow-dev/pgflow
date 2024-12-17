------------------ pgmq --------------------------
CREATE EXTENSION IF NOT EXISTS pgmq;

CREATE SCHEMA IF NOT EXISTS pgflow_pgmq;

SELECT pgmq.create('pgflow');

CREATE OR REPLACE FUNCTION pgflow_pgmq.start_edgefn_worker()
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
begin

    SELECT cron.schedule(
        'pgflow/kepp_edgefn_worker_up',
        '15 seconds',
        $job$
            SELECT pgflow.call_edgefn('pgflow-worker', '');
        $job$
    );

end;
$$;

CREATE OR REPLACE FUNCTION pgflow_pgmq.stop_edgefn_worker()
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
begin

    SELECT cron.unschedule('pgflow/kepp_edgefn_worker_up');

end;
$$;
