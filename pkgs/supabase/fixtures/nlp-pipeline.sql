set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'nlp-pipeline';
delete from pgflow.runs where flow_slug = 'nlp-pipeline';
delete from pgflow.deps where flow_slug = 'nlp-pipeline';
delete from pgflow.steps where flow_slug = 'nlp-pipeline';
delete from pgflow.flows where flow_slug = 'nlp-pipeline';

insert into pgflow.flows (flow_slug) values (
    'nlp-pipeline'
);

insert into pgflow.steps (flow_slug, step_slug) values
('nlp-pipeline', 'text_input'),
('nlp-pipeline', 'openai_embeddings'),
('nlp-pipeline', 'huggingface_embeddings'),
('nlp-pipeline', 'langchain_processing'),
('nlp-pipeline', 'bert_classification'),
('nlp-pipeline', 'gpt_summarization'),
('nlp-pipeline', 'sentiment_analysis'),
('nlp-pipeline', 'result_aggregation');
--
--                          text_input
--                        /    |    \    \
-- openai_embeddings  bert_classification  \
--         |              |          gpt_summarization
-- huggingface_embeddings |           |
--         |              |     sentiment_analysis
--         |              |           |
--    langchain_processing    result_aggregation

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('nlp-pipeline', 'text_input', 'openai_embeddings'),
('nlp-pipeline', 'text_input', 'bert_classification'),
('nlp-pipeline', 'text_input', 'gpt_summarization'),
(
    'nlp-pipeline',
    'openai_embeddings',
    'huggingface_embeddings'
),
(
    'nlp-pipeline',
    'huggingface_embeddings',
    'langchain_processing'
),
(
    'nlp-pipeline',
    'bert_classification',
    'result_aggregation'
),
(
    'nlp-pipeline',
    'gpt_summarization',
    'sentiment_analysis'
),
(
    'nlp-pipeline',
    'sentiment_analysis',
    'result_aggregation'
),
(
    'nlp-pipeline',
    'langchain_processing',
    'result_aggregation'
);
