set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'sequential';
delete from pgflow.runs where flow_slug = 'sequential';
delete from pgflow.deps where flow_slug = 'sequential';
delete from pgflow.steps where flow_slug = 'sequential';
delete from pgflow.flows where flow_slug = 'sequential';

insert into pgflow.flows (flow_slug) values ('sequential');

insert into pgflow.steps (flow_slug, step_slug)
select
    'sequential' as flow_slug,
    i::text as step_slug
from generate_series(1, 10) as i;

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('sequential', '1', '2'),
('sequential', '2', '3'),
('sequential', '3', '4'),
('sequential', '4', '5'),
('sequential', '5', '6'),
('sequential', '6', '7'),
('sequential', '7', '8'),
('sequential', '8', '9'),
('sequential', '9', '10');
