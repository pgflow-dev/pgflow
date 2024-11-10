set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'basic';
delete from pgflow.runs where flow_slug = 'basic';
delete from pgflow.deps where flow_slug = 'basic';
delete from pgflow.steps where flow_slug = 'basic';
delete from pgflow.flows where flow_slug = 'basic';

insert into pgflow.flows (flow_slug) values ('basic');

insert into pgflow.steps (flow_slug, step_slug) values
('basic', 'root'),
('basic', 'left'),
('basic', 'right'),
('basic', 'end');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('basic', 'root', 'left'),
('basic', 'root', 'right'),
('basic', 'left', 'end'),
('basic', 'right', 'end');
