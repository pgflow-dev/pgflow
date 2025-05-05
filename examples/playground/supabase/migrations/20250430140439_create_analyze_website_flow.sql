SELECT pgflow.create_flow('analyze_website', max_attempts => 3, base_delay => 1, timeout => 4);
SELECT pgflow.add_step('analyze_website', 'website');
SELECT pgflow.add_step('analyze_website', 'summary', ARRAY['website']);
SELECT pgflow.add_step('analyze_website', 'tags', ARRAY['website']);
SELECT pgflow.add_step('analyze_website', 'saveToDb', ARRAY['summary', 'tags']);
