set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'FailingStep';
delete from pgflow.runs where flow_slug = 'FailingStep';
delete from pgflow.deps where flow_slug = 'FailingStep';
delete from pgflow.steps where flow_slug = 'FailingStep';
delete from pgflow.flows where flow_slug = 'FailingStep';

insert into pgflow.flows (flow_slug) values ('FailingStep');

insert into pgflow.steps (flow_slug, step_slug) values
('FailingStep', 'root'),
('FailingStep', 'left'),
('FailingStep', 'right'),
('FailingStep', 'end');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('FailingStep', 'root', 'left'),
('FailingStep', 'root', 'right'),
('FailingStep', 'left', 'end'),
('FailingStep', 'right', 'end');
