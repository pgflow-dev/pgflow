set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'small-nlp';
delete from pgflow.runs where flow_slug = 'small-nlp';
delete from pgflow.deps where flow_slug = 'small-nlp';
delete from pgflow.steps where flow_slug = 'small-nlp';
delete from pgflow.flows where flow_slug = 'small-nlp';

insert into pgflow.flows (flow_slug) values ('small-nlp');

insert into pgflow.steps (flow_slug, step_slug) values
('small-nlp', 'input-text'),
('small-nlp', 'sentiment-analysis'),
('small-nlp', 'topic-classification'),
('small-nlp', 'combine-results');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('small-nlp', 'input-text', 'sentiment-analysis'),
('small-nlp', 'input-text', 'topic-classification'),
('small-nlp', 'sentiment-analysis', 'combine-results'),
('small-nlp', 'topic-classification', 'combine-results');
