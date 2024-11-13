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
('nlp-pipeline', 'Text Input'),
('nlp-pipeline', 'OpenAI Embeddings'),
('nlp-pipeline', 'HuggingFace Embeddings'),
('nlp-pipeline', 'LangChain Processing'),
('nlp-pipeline', 'BERT Classification'),
('nlp-pipeline', 'GPT Summarization'),
('nlp-pipeline', 'Sentiment Analysis'),
('nlp-pipeline', 'Result Aggregation');
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
('nlp-pipeline', 'Text Input', 'OpenAI Embeddings'),
('nlp-pipeline', 'Text Input', 'BERT Classification'),
('nlp-pipeline', 'Text Input', 'GPT Summarization'),
(
    'nlp-pipeline',
    'OpenAI Embeddings',
    'HuggingFace Embeddings'
),
(
    'nlp-pipeline',
    'HuggingFace Embeddings',
    'LangChain Processing'
),
(
    'nlp-pipeline',
    'BERT Classification',
    'Result Aggregation'
),
(
    'nlp-pipeline',
    'GPT Summarization',
    'Sentiment Analysis'
),
(
    'nlp-pipeline',
    'Sentiment Analysis',
    'Result Aggregation'
),
(
    'nlp-pipeline',
    'LangChain Processing',
    'Result Aggregation'
);
