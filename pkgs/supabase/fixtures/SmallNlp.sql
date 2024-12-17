set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'SmallNlp';
delete from pgflow.runs where flow_slug = 'SmallNlp';
delete from pgflow.deps where flow_slug = 'SmallNlp';
delete from pgflow.steps where flow_slug = 'SmallNlp';
delete from pgflow.flows where flow_slug = 'SmallNlp';

insert into pgflow.flows (flow_slug) values ('SmallNlp');

insert into pgflow.steps (flow_slug, step_slug) values
('SmallNlp', 'input_text'),
('SmallNlp', 'sentiment_analysis'),
('SmallNlp', 'topic_classification'),
('SmallNlp', 'combine_results');

--       entrypoint
--        /     \
--    left       right
--        \     /
--         finish
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('SmallNlp', 'input_text', 'sentiment_analysis'),
('SmallNlp', 'input_text', 'topic_classification'),
('SmallNlp', 'sentiment_analysis', 'combine_results'),
('SmallNlp', 'topic_classification', 'combine_results');
