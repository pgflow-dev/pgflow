set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'Basic';
delete from pgflow.runs where flow_slug = 'Basic';
delete from pgflow.deps where flow_slug = 'Basic';
delete from pgflow.steps where flow_slug = 'Basic';
delete from pgflow.flows where flow_slug = 'Basic';

insert into pgflow.flows (flow_slug) values ('Basic');

insert into pgflow.steps (flow_slug, step_slug) values
('Basic', 'root'),
('Basic', 'left'),
('Basic', 'right'),
('Basic', 'end');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('Basic', 'root', 'left'),
('Basic', 'root', 'right'),
('Basic', 'left', 'end'),
('Basic', 'right', 'end');
