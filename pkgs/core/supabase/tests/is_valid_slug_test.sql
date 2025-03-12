BEGIN;
SELECT plan(11);
SELECT pgflow_tests.reset_db();

-- TEST: Null input
SELECT ok(
    NOT pgflow.is_valid_slug(NULL),
    'is_valid_slug returns false for NULL input'
);

-- TEST: Empty string
SELECT ok(
    NOT pgflow.is_valid_slug(''),
    'is_valid_slug returns false for empty string'
);

-- TEST: Too long string (128+ chars)
SELECT ok(
    NOT pgflow.is_valid_slug(repeat('x', 129)),
    'is_valid_slug returns false for strings longer than 128 chars'
);

-- TEST: String with dashes
SELECT ok(
    NOT pgflow.is_valid_slug('test-slug'),
    'is_valid_slug returns false for strings with dashes'
);

-- TEST: String with spaces
SELECT ok(
    NOT pgflow.is_valid_slug('test slug'),
    'is_valid_slug returns false for strings with spaces'
);

-- TEST: String starting with number
SELECT ok(
    NOT pgflow.is_valid_slug('123test'),
    'is_valid_slug returns false for strings starting with numbers'
);

-- TEST: Valid single word
SELECT ok(
    pgflow.is_valid_slug('valid'),
    'is_valid_slug returns true for single word'
);

-- TEST: Valid with underscore
SELECT ok(
    pgflow.is_valid_slug('valid_slug'),
    'is_valid_slug returns true for string with underscore'
);

-- TEST: Valid with numbers (not at start)
SELECT ok(
    pgflow.is_valid_slug('valid123'),
    'is_valid_slug returns true for string with numbers not at start'
);

-- TEST: Valid mixed case
SELECT ok(
    pgflow.is_valid_slug('validSlug'),
    'is_valid_slug returns true for mixed case string'
);

-- TEST:
SELECT ok(
  NOT pgflow.is_valid_slug('run'),
  'is_valid_slug returns false for reserved word'
);

SELECT finish();
ROLLBACK;
