set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'ProcessVoiceMemo';
delete from pgflow.runs where flow_slug = 'ProcessVoiceMemo';
delete from pgflow.deps where flow_slug = 'ProcessVoiceMemo';
delete from pgflow.steps where flow_slug = 'ProcessVoiceMemo';
delete from pgflow.flows where flow_slug = 'ProcessVoiceMemo';

insert into pgflow.flows (flow_slug) values ('ProcessVoiceMemo');

insert into pgflow.steps (flow_slug, step_slug) values
('ProcessVoiceMemo', 'transcription'),
('ProcessVoiceMemo', 'newShare');

--       transcription
--            |
--         newShare
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('ProcessVoiceMemo', 'transcription', 'newShare');
