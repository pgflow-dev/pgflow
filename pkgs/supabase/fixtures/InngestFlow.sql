set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'InngestFlow';
delete from pgflow.runs where flow_slug = 'InngestFlow';
delete from pgflow.deps where flow_slug = 'InngestFlow';
delete from pgflow.steps where flow_slug = 'InngestFlow';
delete from pgflow.flows where flow_slug = 'InngestFlow';

insert into pgflow.flows (flow_slug) values ('InngestFlow');

insert into pgflow.steps (flow_slug, step_slug) values
('InngestFlow', 'transcribeVideo'),
('InngestFlow', 'summarizeTranscript'),
('InngestFlow', 'writeToDb');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('InngestFlow', 'transcribeVideo', 'summarizeTranscript'),
('InngestFlow', 'transcribeVideo', 'writeToDb'),
('InngestFlow', 'summarizeTranscript', 'writeToDb');
