select pgflow.create_flow('analyze_website', max_attempts => 3, base_delay => 1, timeout => 4);
select pgflow.add_step('analyze_website', 'website');
select pgflow.add_step('analyze_website', 'sentiment', array['website']);
select pgflow.add_step('analyze_website', 'summary', array['website']);
select pgflow.add_step('analyze_website', 'tags', array['website']);
select pgflow.add_step('analyze_website', 'saveToDb', array['sentiment', 'summary', 'tags']);
