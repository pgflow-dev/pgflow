SELECT pgflow.create_flow('analyze_website', max_attempts => 3, base_delay => 2, timeout => 10);
SELECT pgflow.add_step('analyze_website', 'website');
SELECT pgflow.add_step('analyze_website', 'sentiment', ARRAY['website'], max_attempts => 5, timeout => 30);
SELECT pgflow.add_step('analyze_website', 'summary', ARRAY['website']);
SELECT pgflow.add_step('analyze_website', 'tags', ARRAY['website']);
SELECT pgflow.add_step('analyze_website', 'saveToDb', ARRAY['sentiment', 'summary', 'tags']);
