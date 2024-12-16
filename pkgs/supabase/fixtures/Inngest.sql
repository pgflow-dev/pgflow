set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'Inngest';
delete from pgflow.runs where flow_slug = 'Inngest';
delete from pgflow.deps where flow_slug = 'Inngest';
delete from pgflow.steps where flow_slug = 'Inngest';
delete from pgflow.flows where flow_slug = 'Inngest';

insert into pgflow.flows (flow_slug) values ('Inngest');

insert into pgflow.steps (flow_slug, step_slug) values
('Inngest', 'transcribeVideo'),
('Inngest', 'summarizeTranscript'),
('Inngest', 'writeToDb');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('Inngest', 'transcribeVideo', 'summarizeTranscript'),
('Inngest', 'transcribeVideo', 'writeToDb'),
('Inngest', 'summarizeTranscript', 'writeToDb');
