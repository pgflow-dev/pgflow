SELECT pgflow.create_flow('article_flow', max_attempts => 3);
SELECT pgflow.add_step('article_flow', 'fetch_article');
SELECT pgflow.add_step('article_flow', 'summarize', ARRAY['fetch_article']);
SELECT pgflow.add_step('article_flow', 'extract_keywords', ARRAY['fetch_article']);
SELECT pgflow.add_step('article_flow', 'publish', ARRAY['summarize', 'extract_keywords']);
