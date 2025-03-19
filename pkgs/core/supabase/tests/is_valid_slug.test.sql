begin;
select plan(11);
select pgflow_tests.reset_db();

-- TEST: Null input
select ok(
  not pgflow.is_valid_slug(null),
  'is_valid_slug returns false for NULL input'
);

-- TEST: Empty string
select ok(
  not pgflow.is_valid_slug(''),
  'is_valid_slug returns false for empty string'
);

-- TEST: Too long string (128+ chars)
select ok(
  not pgflow.is_valid_slug(repeat('x', 129)),
  'is_valid_slug returns false for strings longer than 128 chars'
);

-- TEST: String with dashes
select ok(
  not pgflow.is_valid_slug('test-slug'),
  'is_valid_slug returns false for strings with dashes'
);

-- TEST: String with spaces
select ok(
  not pgflow.is_valid_slug('test slug'),
  'is_valid_slug returns false for strings with spaces'
);

-- TEST: String starting with number
select ok(
  not pgflow.is_valid_slug('123test'),
  'is_valid_slug returns false for strings starting with numbers'
);

-- TEST: Valid single word
select ok(
  pgflow.is_valid_slug('valid'),
  'is_valid_slug returns true for single word'
);

-- TEST: Valid with underscore
select ok(
  pgflow.is_valid_slug('valid_slug'),
  'is_valid_slug returns true for string with underscore'
);

-- TEST: Valid with numbers (not at start)
select ok(
  pgflow.is_valid_slug('valid123'),
  'is_valid_slug returns true for string with numbers not at start'
);

-- TEST: Valid mixed case
select ok(
  pgflow.is_valid_slug('validSlug'),
  'is_valid_slug returns true for mixed case string'
);

-- TEST:
select ok(
  not pgflow.is_valid_slug('run'),
  'is_valid_slug returns false for reserved word'
);

select finish();
rollback;
