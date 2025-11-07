select pgflow.create_flow('article_flow', max_attempts => 3);
select pgflow.add_step('article_flow', 'fetchArticle');
select pgflow.add_step('article_flow', 'summarize', array['fetchArticle'], base_delay => 1);
select pgflow.add_step('article_flow', 'extractKeywords', array['fetchArticle']);
select pgflow.add_step('article_flow', 'publish', array['summarize', 'extractKeywords']);
