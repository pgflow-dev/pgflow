begin;
select plan(17);
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
  pgflow.is_valid_slug('a_b'),
  'is_valid_slug returns true for single internal underscore'
);

-- TEST: Valid with numbers (not at start)
select ok(
  pgflow.is_valid_slug('a1'),
  'is_valid_slug returns true for string with numbers not at start'
);

-- TEST: Valid mixed case
select ok(
  pgflow.is_valid_slug('camelCase'),
  'is_valid_slug returns true for mixed case string'
);

-- TEST: Exact 128-character slug stays valid
select ok(
  pgflow.is_valid_slug(repeat('a', 128)),
  'is_valid_slug returns true for exact 128-character slug'
);

-- TEST: Leading underscore
select ok(
  not pgflow.is_valid_slug('_a'),
  'is_valid_slug returns false for leading underscore'
);

-- TEST: Trailing underscore
select ok(
  not pgflow.is_valid_slug('a_'),
  'is_valid_slug returns false for trailing underscore'
);

-- TEST: Double underscore
select ok(
  not pgflow.is_valid_slug('a__b'),
  'is_valid_slug returns false for embedded double underscore'
);

-- TEST: Bare underscore
select ok(
  not pgflow.is_valid_slug('_'),
  'is_valid_slug returns false for bare underscore'
);

-- TEST: Triple underscore inside
select ok(
  not pgflow.is_valid_slug('a___b'),
  'is_valid_slug returns false for triple underscore'
);

-- TEST:
select ok(
  not pgflow.is_valid_slug('run'),
  'is_valid_slug returns false for reserved word'
);

select finish();
rollback;
