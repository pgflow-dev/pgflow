set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'NlpPipeline2';
delete from pgflow.runs where flow_slug = 'NlpPipeline2';
delete from pgflow.deps where flow_slug = 'NlpPipeline2';
delete from pgflow.steps where flow_slug = 'NlpPipeline2';
delete from pgflow.flows where flow_slug = 'NlpPipeline2';

insert into pgflow.flows (flow_slug) values (
    'NlpPipeline2'
);

insert into pgflow.steps (flow_slug, step_slug) values
('NlpPipeline2', 'Text_Input'),
('NlpPipeline2', 'OpenAI_Embeddings'),
('NlpPipeline2', 'HuggingFace_Embeddings'),
('NlpPipeline2', 'LangChain_Processing'),
('NlpPipeline2', 'BERT_Classification'),
('NlpPipeline2', 'GPT_Summarization'),
('NlpPipeline2', 'Sentiment_Analysis'),
('NlpPipeline2', 'Named_Entity_Recognition'),
('NlpPipeline2', 'Topic_Modeling'),
('NlpPipeline2', 'Keyword_Extraction'),
('NlpPipeline2', 'Text_Classification'),
('NlpPipeline2', 'Document_Clustering'),
('NlpPipeline2', 'Result_Aggregation');
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
('NlpPipeline2', 'Text_Input', 'OpenAI_Embeddings'),
('NlpPipeline2', 'Text_Input', 'BERT_Classification'),
('NlpPipeline2', 'Text_Input', 'Topic_Modeling'),
('NlpPipeline2', 'Text_Input', 'Keyword_Extraction'),
('NlpPipeline2', 'Text_Input', 'Text_Classification'),
('NlpPipeline2', 'OpenAI_Embeddings', 'HuggingFace_Embeddings'),
('NlpPipeline2', 'HuggingFace_Embeddings', 'LangChain_Processing'),
('NlpPipeline2', 'BERT_Classification', 'Sentiment_Analysis'),
('NlpPipeline2', 'Topic_Modeling', 'Named_Entity_Recognition'),
('NlpPipeline2', 'Keyword_Extraction', 'Document_Clustering'),
('NlpPipeline2', 'LangChain_Processing', 'Result_Aggregation'),
('NlpPipeline2', 'Sentiment_Analysis', 'Result_Aggregation'),
('NlpPipeline2', 'Named_Entity_Recognition', 'Result_Aggregation'),
('NlpPipeline2', 'Document_Clustering', 'Result_Aggregation'),
('NlpPipeline2', 'Text_Classification', 'Result_Aggregation');
