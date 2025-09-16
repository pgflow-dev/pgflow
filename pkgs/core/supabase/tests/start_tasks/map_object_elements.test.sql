begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test: Map tasks correctly handle arrays of complex objects
select diag('Testing map tasks with complex object elements');

-- SETUP: Create flow with root map
select pgflow.create_flow('object_elements_flow');
select pgflow.add_step(
  flow_slug => 'object_elements_flow',
  step_slug => 'object_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Start flow with array of user objects
select run_id from pgflow.start_flow(
  'object_elements_flow',
  '[
    {
      "id": 1,
      "name": "Alice",
      "email": "alice@example.com",
      "tags": ["admin", "developer"],
      "metadata": {
        "created": "2024-01-01",
        "preferences": {
          "theme": "dark",
          "notifications": true
        }
      }
    },
    {
      "id": 2,
      "name": "Bob",
      "email": "bob@example.com",
      "tags": ["user"],
      "metadata": {
        "created": "2024-01-02",
        "preferences": {
          "theme": "light",
          "notifications": false
        }
      }
    },
    {
      "id": 3,
      "name": "Charlie",
      "email": "charlie@example.com",
      "tags": ["admin", "user", "moderator"],
      "metadata": null
    }
  ]'::jsonb
) \gset

-- Verify 3 tasks were created
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'object_map'),
  3::bigint,
  'Should create 3 tasks for array with 3 user objects'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('object_elements_flow');

-- Get message IDs for each task
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'object_map' and task_index = 0 \gset

select message_id as msg_id_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'object_map' and task_index = 1 \gset

select message_id as msg_id_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'object_map' and task_index = 2 \gset

-- TEST: Each task receives complete object with all nested structure
select is(
  (select input->>'name' from pgflow.start_tasks(
    'object_elements_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  'Alice',
  'Task 0 should receive complete Alice object'
);

select is(
  (select input->'metadata'->'preferences'->>'theme' from pgflow.start_tasks(
    'object_elements_flow',
    ARRAY[:'msg_id_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  'light',
  'Task 1 should receive complete Bob object with nested preferences'
);

select is(
  (select input->'metadata' from pgflow.start_tasks(
    'object_elements_flow',
    ARRAY[:'msg_id_2'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  'null'::jsonb,
  'Task 2 should receive Charlie object with null metadata'
);

-- TEST: Verify array fields within objects are preserved
-- First, we need to reset the first task back to queued
update pgflow.step_tasks
set status = 'queued', started_at = null, attempts_count = 0
where run_id = :'run_id' and step_slug = 'object_map' and task_index = 0;

select is(
  (select jsonb_array_length(input->'tags') from pgflow.start_tasks(
    'object_elements_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  2,
  'Task 0 object should have tags array with 2 elements'
);

select finish();
rollback;