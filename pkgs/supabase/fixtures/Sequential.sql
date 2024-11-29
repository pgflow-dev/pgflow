set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'Sequential';
delete from pgflow.runs where flow_slug = 'Sequential';
delete from pgflow.deps where flow_slug = 'Sequential';
delete from pgflow.steps where flow_slug = 'Sequential';
delete from pgflow.flows where flow_slug = 'Sequential';

insert into pgflow.flows (flow_slug) values ('Sequential');

insert into pgflow.steps (flow_slug, step_slug)
select
    'Sequential' as flow_slug,
    i::text as step_slug
from generate_series(1, 10) as i;

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('Sequential', '1', '2'),
('Sequential', '2', '3'),
('Sequential', '3', '4'),
('Sequential', '4', '5'),
('Sequential', '5', '6'),
('Sequential', '6', '7'),
('Sequential', '7', '8'),
('Sequential', '8', '9'),
('Sequential', '9', '10');
