set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'HatchetFlow';
delete from pgflow.runs where flow_slug = 'HatchetFlow';
delete from pgflow.deps where flow_slug = 'HatchetFlow';
delete from pgflow.steps where flow_slug = 'HatchetFlow';
delete from pgflow.flows where flow_slug = 'HatchetFlow';

insert into pgflow.flows (flow_slug) values ('HatchetFlow');

insert into pgflow.steps (flow_slug, step_slug) values
('HatchetFlow', 'start'),
('HatchetFlow', 'load_docs'),
('HatchetFlow', 'reason_docs'),
('HatchetFlow', 'generate_response');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('HatchetFlow', 'start', 'load_docs'),
('HatchetFlow', 'load_docs', 'reason_docs'),
('HatchetFlow', 'reason_docs', 'generate_response');
