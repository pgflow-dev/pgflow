select pgflow.create_flow('article_flow', max_attempts => 3);
select pgflow.add_step('article_flow', 'fetch_article');
select pgflow.add_step('article_flow', 'summarize', array['fetch_article'], base_delay => 1);
select pgflow.add_step('article_flow', 'extract_keywords', array['fetch_article']);
select pgflow.add_step('article_flow', 'publish', array['summarize', 'extract_keywords']);
