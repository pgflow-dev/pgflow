set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'FailingStepFlow';
delete from pgflow.runs where flow_slug = 'FailingStepFlow';
delete from pgflow.deps where flow_slug = 'FailingStepFlow';
delete from pgflow.steps where flow_slug = 'FailingStepFlow';
delete from pgflow.flows where flow_slug = 'FailingStepFlow';

insert into pgflow.flows (flow_slug) values ('FailingStepFlow');

insert into pgflow.steps (flow_slug, step_slug) values
('FailingStepFlow', 'root'),
('FailingStepFlow', 'left'),
('FailingStepFlow', 'right'),
('FailingStepFlow', 'end');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('FailingStepFlow', 'root', 'left'),
('FailingStepFlow', 'root', 'right'),
('FailingStepFlow', 'left', 'end'),
('FailingStepFlow', 'right', 'end');
