set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'Hatchet';
delete from pgflow.runs where flow_slug = 'Hatchet';
delete from pgflow.deps where flow_slug = 'Hatchet';
delete from pgflow.steps where flow_slug = 'Hatchet';
delete from pgflow.flows where flow_slug = 'Hatchet';

insert into pgflow.flows (flow_slug) values ('Hatchet');

insert into pgflow.steps (flow_slug, step_slug) values
('Hatchet', 'start'),
('Hatchet', 'load_docs'),
('Hatchet', 'reason_docs'),
('Hatchet', 'generate_response');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('Hatchet', 'start', 'load_docs'),
('Hatchet', 'load_docs', 'reason_docs'),
('Hatchet', 'reason_docs', 'generate_response');
