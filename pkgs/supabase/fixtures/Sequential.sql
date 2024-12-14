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
    's' || i::text as step_slug
from generate_series(1, 10) as i;

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('Sequential', 's1', 's2'),
('Sequential', 's2', 's3'),
('Sequential', 's3', 's4'),
('Sequential', 's4', 's5'),
('Sequential', 's5', 's6'),
('Sequential', 's6', 's7'),
('Sequential', 's7', 's8'),
('Sequential', 's8', 's9'),
('Sequential', 's9', 's10');
