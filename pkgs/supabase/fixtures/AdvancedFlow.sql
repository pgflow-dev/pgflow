set search_path to pgflow;

delete from pgflow.step_tasks where flow_slug = 'AdvancedFlow';
delete from pgflow.step_states where flow_slug = 'AdvancedFlow';
delete from pgflow.runs where flow_slug = 'AdvancedFlow';
delete from pgflow.deps where flow_slug = 'AdvancedFlow';
delete from pgflow.steps where flow_slug = 'AdvancedFlow';
delete from pgflow.flows where flow_slug = 'AdvancedFlow';

insert into pgflow.flows (flow_slug) values ('AdvancedFlow');

-- Flow: AdvancedFlow
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
('AdvancedFlow', 'start'),
('AdvancedFlow', 'load_doc'),
('AdvancedFlow', 'check_format'),
('AdvancedFlow', 'convert_to_text'),
('AdvancedFlow', 'extract_text'),
('AdvancedFlow', 'extract_metadata'),
('AdvancedFlow', 'detect_language'),
('AdvancedFlow', 'translate_text'),
('AdvancedFlow', 'perform_ner'),
('AdvancedFlow', 'sentiment_analysis'),
('AdvancedFlow', 'generate_summary'),
('AdvancedFlow', 'generate_keywords'),
('AdvancedFlow', 'embed_text'),
('AdvancedFlow', 'index_vector_store'),
('AdvancedFlow', 'update_search_index'),
('AdvancedFlow', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('AdvancedFlow', 'start', 'load_doc'),
('AdvancedFlow', 'load_doc', 'check_format'),
('AdvancedFlow', 'check_format', 'convert_to_text'),
('AdvancedFlow', 'convert_to_text', 'extract_text'),
('AdvancedFlow', 'convert_to_text', 'extract_metadata'),
('AdvancedFlow', 'extract_text', 'detect_language'),
('AdvancedFlow', 'detect_language', 'translate_text'),
('AdvancedFlow', 'translate_text', 'perform_ner'),
('AdvancedFlow', 'translate_text', 'sentiment_analysis'),
('AdvancedFlow', 'perform_ner', 'generate_summary'),
('AdvancedFlow', 'sentiment_analysis', 'generate_summary'),
('AdvancedFlow', 'generate_summary', 'generate_keywords'),
('AdvancedFlow', 'extract_metadata', 'generate_keywords'),
('AdvancedFlow', 'generate_keywords', 'embed_text'),
('AdvancedFlow', 'embed_text', 'index_vector_store'),
('AdvancedFlow', 'index_vector_store', 'update_search_index'),
('AdvancedFlow', 'update_search_index', 'finish');
