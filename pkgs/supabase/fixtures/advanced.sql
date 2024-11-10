set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'advanced';
delete from pgflow.runs where flow_slug = 'advanced';
delete from pgflow.deps where flow_slug = 'advanced';
delete from pgflow.steps where flow_slug = 'advanced';
delete from pgflow.flows where flow_slug = 'advanced';

insert into pgflow.flows (flow_slug) values ('advanced');

-- Flow: advanced
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
('advanced', 'start'),
('advanced', 'load_doc'),
('advanced', 'check_format'),
('advanced', 'convert_to_text'),
('advanced', 'extract_text'),
('advanced', 'extract_metadata'),
('advanced', 'detect_language'),
('advanced', 'translate_text'),
('advanced', 'perform_ner'),
('advanced', 'sentiment_analysis'),
('advanced', 'generate_summary'),
('advanced', 'generate_keywords'),
('advanced', 'embed_text'),
('advanced', 'index_vector_store'),
('advanced', 'update_search_index'),
('advanced', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('advanced', 'start', 'load_doc'),
('advanced', 'load_doc', 'check_format'),
('advanced', 'check_format', 'convert_to_text'),
('advanced', 'convert_to_text', 'extract_text'),
('advanced', 'convert_to_text', 'extract_metadata'),
('advanced', 'extract_text', 'detect_language'),
('advanced', 'detect_language', 'translate_text'),
('advanced', 'translate_text', 'perform_ner'),
('advanced', 'translate_text', 'sentiment_analysis'),
('advanced', 'perform_ner', 'generate_summary'),
('advanced', 'sentiment_analysis', 'generate_summary'),
('advanced', 'generate_summary', 'generate_keywords'),
('advanced', 'extract_metadata', 'generate_keywords'),
('advanced', 'generate_keywords', 'embed_text'),
('advanced', 'embed_text', 'index_vector_store'),
('advanced', 'index_vector_store', 'update_search_index'),
('advanced', 'update_search_index', 'finish');
