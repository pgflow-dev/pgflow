set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'nlp-pipeline-2';
delete from pgflow.runs where flow_slug = 'nlp-pipeline-2';
delete from pgflow.deps where flow_slug = 'nlp-pipeline-2';
delete from pgflow.steps where flow_slug = 'nlp-pipeline-2';
delete from pgflow.flows where flow_slug = 'nlp-pipeline-2';

insert into pgflow.flows (flow_slug) values (
    'nlp-pipeline-2'
);

insert into pgflow.steps (flow_slug, step_slug) values
('nlp-pipeline-2', 'Text Input'),
('nlp-pipeline-2', 'OpenAI Embeddings'),
('nlp-pipeline-2', 'HuggingFace Embeddings'),
('nlp-pipeline-2', 'LangChain Processing'),
('nlp-pipeline-2', 'BERT Classification'),
('nlp-pipeline-2', 'GPT Summarization'),
('nlp-pipeline-2', 'Sentiment Analysis'),
('nlp-pipeline-2', 'Named Entity Recognition'),
('nlp-pipeline-2', 'Topic Modeling'),
('nlp-pipeline-2', 'Keyword Extraction'),
('nlp-pipeline-2', 'Text Classification'),
('nlp-pipeline-2', 'Document Clustering'),
('nlp-pipeline-2', 'Result Aggregation');
--
--                          text_input
--                    /    /    |    \    \    \
-- openai_embeddings  bert  topic  keyword  text_class
--         |          |      |      |         |
-- huggingface    sentiment  ner  clustering   |
--         |          |      |      |         |
-- langchain_processing      |      |         |
--                    \      |      |         |
--                     \     |      |         |
--                      result_aggregation ----/

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug)
values
('nlp-pipeline-2', 'Text Input', 'OpenAI Embeddings'),
('nlp-pipeline-2', 'Text Input', 'BERT Classification'),
('nlp-pipeline-2', 'Text Input', 'Topic Modeling'),
('nlp-pipeline-2', 'Text Input', 'Keyword Extraction'),
('nlp-pipeline-2', 'Text Input', 'Text Classification'),
('nlp-pipeline-2', 'OpenAI Embeddings', 'HuggingFace Embeddings'),
('nlp-pipeline-2', 'HuggingFace Embeddings', 'LangChain Processing'),
('nlp-pipeline-2', 'BERT Classification', 'Sentiment Analysis'),
('nlp-pipeline-2', 'Topic Modeling', 'Named Entity Recognition'),
('nlp-pipeline-2', 'Keyword Extraction', 'Document Clustering'),
('nlp-pipeline-2', 'LangChain Processing', 'Result Aggregation'),
('nlp-pipeline-2', 'Sentiment Analysis', 'Result Aggregation'),
('nlp-pipeline-2', 'Named Entity Recognition', 'Result Aggregation'),
('nlp-pipeline-2', 'Document Clustering', 'Result Aggregation'),
('nlp-pipeline-2', 'Text Classification', 'Result Aggregation');
