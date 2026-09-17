-- #651 shared flow/step naming restrictions: no leading/trailing underscore,
-- no double underscore, case-only duplicate step slugs rejected per flow.
-- Single internal underscores and camelCase remain valid.
begin;
select plan(13);

select pgflow_tests.reset_db();

-- Boundary and double underscores are invalid for both flows and steps
select ok(
  not pgflow.is_valid_slug('_leading'),
  'leading underscore is invalid'
);
select ok(
  not pgflow.is_valid_slug('trailing_'),
  'trailing underscore is invalid'
);
select ok(
  not pgflow.is_valid_slug('double__underscore'),
  'double underscore is invalid'
);

-- Single internal underscores and camelCase remain valid
select ok(
  pgflow.is_valid_slug('single_internal_underscore'),
  'single internal underscores remain valid'
);
select ok(
  pgflow.is_valid_slug('camelCaseSlug'),
  'camelCase remains valid'
);

-- Case-only duplicate step slugs are rejected within one flow
select pgflow_tests.setup_flow('sequential');
select throws_ok(
  $$ select pgflow.add_step('sequential', 'FIRST') $$,
  'duplicate key value violates unique constraint "idx_steps_normalized_slug"',
  'case-only duplicate step slug is rejected by a unique index'
);

-- The new rules also reject invalid direct SQL definitions before any queue
-- work happens
select throws_ok(
  $$ select pgflow.create_flow('bad__slug') $$,
  'new row for relation "flows" violates check constraint "slug_is_valid"',
  'double underscore in a flow slug is rejected by the table constraint'
);

select throws_ok(
  $$ select pgflow.add_step('sequential', 'bad__step') $$,
  'new row for relation "steps" violates check constraint "steps_step_slug_check"',
  'double underscore in a step slug is rejected by the table constraint'
);

-- Repeated add_step calls keep the persisted route stable
select is(
  (select queue_name from pgflow.steps where flow_slug = 'sequential' and step_slug = 'first'),
  'sequential',
  'persisted route is stable after initial add_step'
);

-- #651 correction: the authoritative derivation validates the flow slug and
-- every step slug before route resolution, collision checks, or PGMQ work,
-- so an invalid slug error outranks a queue collision or queue-name work.

-- An invalid flow slug wins over a case-insensitive step collision
select throws_ok(
  $$
    select pgflow._derive_queue_routes(
      'bad__slug',
      jsonb_build_object(
        'steps',
        jsonb_build_array(
          jsonb_build_object('slug', 'a'),
          jsonb_build_object('slug', 'A')
        )
      ),
      'step'
    )
  $$,
  'Flow slug "bad__slug" is not valid.',
  'invalid flow slug is reported before the step collision'
);

-- An invalid step slug wins over an earlier case-insensitive collision
-- between two valid slugs: validation covers the complete shape first
select throws_ok(
  $$
    select pgflow._derive_queue_routes(
      'goodflow',
      jsonb_build_object(
        'steps',
        jsonb_build_array(
          jsonb_build_object('slug', 'a'),
          jsonb_build_object('slug', 'A'),
          jsonb_build_object('slug', 'bad__step')
        )
      ),
      'step'
    )
  $$,
  'Step slug "bad__step" in flow "goodflow" is not valid.',
  'invalid step slug is reported before the queue collision'
);

-- An invalid flow slug also wins over PGMQ name-length work: this slug is
-- both invalid (trailing underscores) and too long for any derived queue
select throws_ok(
  $$
    select pgflow._derive_queue_routes(
      rpad('f', 48, '_'),
      jsonb_build_object('steps', jsonb_build_array(jsonb_build_object('slug', 's'))),
      'step'
    )
  $$,
  'Flow slug "' || rpad('f', 48, '_') || '" is not valid.',
  'invalid flow slug is reported before PGMQ queue-name work'
);

-- Control: with valid slugs the same collision is still reported
select throws_ok(
  $$
    select pgflow._derive_queue_routes(
      'goodflow',
      jsonb_build_object(
        'steps',
        jsonb_build_array(
          jsonb_build_object('slug', 'a'),
          jsonb_build_object('slug', 'A')
        )
      ),
      'step'
    )
  $$,
  'Steps "a" and "A" in flow "goodflow" conflict case-insensitively.',
  'valid slugs still report the case-insensitive collision'
);

select finish();
rollback;
