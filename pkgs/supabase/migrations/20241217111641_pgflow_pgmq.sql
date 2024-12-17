------------------ pgmq --------------------------
CREATE EXTENSION IF NOT EXISTS pgmq;

CREATE SCHEMA IF NOT EXISTS pgflow_pgmq;

SELECT pgmq.create('pgflow');
