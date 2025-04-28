SELECT pgflow.create_flow('sequential');
SELECT pgflow.add_step('sequential', 'increment');
SELECT pgflow.add_step('sequential', 'multiply');
SELECT pgflow.add_step('sequential', 'sum', ARRAY['multiply', 'increment']);
