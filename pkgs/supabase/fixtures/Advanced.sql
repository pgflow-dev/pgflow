set search_path to pgflow;

delete from pgflow.step_tasks where flow_slug = 'Advanced';
delete from pgflow.step_states where flow_slug = 'Advanced';
delete from pgflow.runs where flow_slug = 'Advanced';
delete from pgflow.deps where flow_slug = 'Advanced';
delete from pgflow.steps where flow_slug = 'Advanced';
delete from pgflow.flows where flow_slug = 'Advanced';

insert into pgflow.flows (flow_slug) values ('Advanced');

-- Flow: Advanced
--
--                start
--                  |
--              load_doc
--                  |
--            check_format
--                  |
--          convert_to_text
--             /          \
--    extract_text     extract_metadata
--           |                |
--   detect_language          |
--           |                |
--   translate_text           |
--        /      \            |
-- perform_ner  sentiment_analysis
--        \        /
--      generate_summary
--             |
--     generate_keywords
--         /        \
-- extract_metadata  |
--         \        /
--        embed_text
--            |
--   index_vector_store
--            |
--  update_search_index
--            |
--          finish

insert into pgflow.steps (flow_slug, step_slug) values
('Advanced', 'start'),
('Advanced', 'load_doc'),
('Advanced', 'check_format'),
('Advanced', 'convert_to_text'),
('Advanced', 'extract_text'),
('Advanced', 'extract_metadata'),
('Advanced', 'detect_language'),
('Advanced', 'translate_text'),
('Advanced', 'perform_ner'),
('Advanced', 'sentiment_analysis'),
('Advanced', 'generate_summary'),
('Advanced', 'generate_keywords'),
('Advanced', 'embed_text'),
('Advanced', 'index_vector_store'),
('Advanced', 'update_search_index'),
('Advanced', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('Advanced', 'start', 'load_doc'),
('Advanced', 'load_doc', 'check_format'),
('Advanced', 'check_format', 'convert_to_text'),
('Advanced', 'convert_to_text', 'extract_text'),
('Advanced', 'convert_to_text', 'extract_metadata'),
('Advanced', 'extract_text', 'detect_language'),
('Advanced', 'detect_language', 'translate_text'),
('Advanced', 'translate_text', 'perform_ner'),
('Advanced', 'translate_text', 'sentiment_analysis'),
('Advanced', 'perform_ner', 'generate_summary'),
('Advanced', 'sentiment_analysis', 'generate_summary'),
('Advanced', 'generate_summary', 'generate_keywords'),
('Advanced', 'extract_metadata', 'generate_keywords'),
('Advanced', 'generate_keywords', 'embed_text'),
('Advanced', 'embed_text', 'index_vector_store'),
('Advanced', 'index_vector_store', 'update_search_index'),
('Advanced', 'update_search_index', 'finish');
