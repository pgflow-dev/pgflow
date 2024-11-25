set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'NlpPipeline';
delete from pgflow.runs where flow_slug = 'NlpPipeline';
delete from pgflow.deps where flow_slug = 'NlpPipeline';
delete from pgflow.steps where flow_slug = 'NlpPipeline';
delete from pgflow.flows where flow_slug = 'NlpPipeline';

insert into pgflow.flows (flow_slug) values (
    'NlpPipeline'
);

insert into pgflow.steps (flow_slug, step_slug) values
('NlpPipeline', 'text_input'),
('NlpPipeline', 'openai_embeddings'),
('NlpPipeline', 'huggingface_embeddings'),
('NlpPipeline', 'langchain_processing'),
('NlpPipeline', 'bert_classification'),
('NlpPipeline', 'gpt_summarization'),
('NlpPipeline', 'sentiment_analysis'),
('NlpPipeline', 'result_aggregation');
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
('NlpPipeline', 'text_input', 'openai_embeddings'),
('NlpPipeline', 'text_input', 'bert_classification'),
('NlpPipeline', 'text_input', 'gpt_summarization'),
(
    'NlpPipeline',
    'openai_embeddings',
    'huggingface_embeddings'
),
(
    'NlpPipeline',
    'huggingface_embeddings',
    'langchain_processing'
),
(
    'NlpPipeline',
    'bert_classification',
    'result_aggregation'
),
(
    'NlpPipeline',
    'gpt_summarization',
    'sentiment_analysis'
),
(
    'NlpPipeline',
    'sentiment_analysis',
    'result_aggregation'
),
(
    'NlpPipeline',
    'langchain_processing',
    'result_aggregation'
);
