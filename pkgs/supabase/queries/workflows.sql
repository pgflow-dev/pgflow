set search_path to pgflow;
delete from pgflow.deps;
delete from pgflow.step_states;
delete from pgflow.steps;
delete from pgflow.runs;
delete from pgflow.workflows;

insert into pgflow.workflows (slug) values ('flow_01');

insert into pgflow.steps (workflow_slug, slug) values
('flow_01', 'root'),
('flow_01', 'left'),
('flow_01', 'right'),
('flow_01', 'end');
--
--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish

insert into pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
values
('flow_01', 'root', 'left'),
('flow_01', 'root', 'right'),
('flow_01', 'left', 'end'),
('flow_01', 'right', 'end');

select pgflow.run_workflow('flow_01', '{"input": "hello world"}'::jsonb);

-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'root', '{"yeaboi": 23}'::jsonb);
-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'left', '"hello"'::jsonb);
-- select pgflow.complete_step('c7d57b96-7d08-4602-a23a-535b6e8ba6d8', 'right', '"ellho"'::jsonb);

-- uuid - 6ba7b810-9dad-11d1-80b4-00c04fd430c8
-- insert into runs (workflow_slug, id, status, payload) values (
--     'flow_01',
--     '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
--     'created', '{"input": "hello world"}'::jsonb
-- );

-- insert into step_states (workflow_slug, workflow_instance_id, step_id) values
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'root'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'left'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'right'),
-- ('flow_01', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'end');
