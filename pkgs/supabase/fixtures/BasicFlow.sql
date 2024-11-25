set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'BasicFlow';
delete from pgflow.runs where flow_slug = 'BasicFlow';
delete from pgflow.deps where flow_slug = 'BasicFlow';
delete from pgflow.steps where flow_slug = 'BasicFlow';
delete from pgflow.flows where flow_slug = 'BasicFlow';

insert into pgflow.flows (flow_slug) values ('BasicFlow');

insert into pgflow.steps (flow_slug, step_slug) values
('BasicFlow', 'root'),
('BasicFlow', 'left'),
('BasicFlow', 'right'),
('BasicFlow', 'end');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('BasicFlow', 'root', 'left'),
('BasicFlow', 'root', 'right'),
('BasicFlow', 'left', 'end'),
('BasicFlow', 'right', 'end');
