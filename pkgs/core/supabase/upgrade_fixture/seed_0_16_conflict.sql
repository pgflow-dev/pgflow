-- 0.16.0 conflict fixture seed: two existing flow definitions whose normalized
-- default queue collides ('MyConflict' and 'myconflict'). The 0.16.0 schema
-- allows this; the persist_queue_identity migration must reject it and leave
-- the database unchanged (#650).
insert into pgflow.flows (flow_slug) values ('MyConflict');
insert into pgflow.flows (flow_slug) values ('myconflict');
