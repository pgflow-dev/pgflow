BEGIN;
SELECT plan(10);

-- Test case 1: Null input
SELECT ok(
    NOT pgflow.is_valid_slug(NULL),
    'is_valid_slug returns false for NULL input'
);

-- Test case 2: Empty string
SELECT ok(
    NOT pgflow.is_valid_slug(''),
    'is_valid_slug returns false for empty string'
);

-- Test case 3: Too long string (128+ chars)
SELECT ok(
    NOT pgflow.is_valid_slug(repeat('x', 129)),
    'is_valid_slug returns false for strings longer than 128 chars'
);

-- Test case 4: String with dashes
SELECT ok(
    NOT pgflow.is_valid_slug('test-slug'),
    'is_valid_slug returns false for strings with dashes'
);

-- Test case 5: String with spaces
SELECT ok(
    NOT pgflow.is_valid_slug('test slug'),
    'is_valid_slug returns false for strings with spaces'
);

-- Test case 6: String starting with number
SELECT ok(
    NOT pgflow.is_valid_slug('123test'),
    'is_valid_slug returns false for strings starting with numbers'
);

-- Test case 7: Valid single word
SELECT ok(
    pgflow.is_valid_slug('valid'),
    'is_valid_slug returns true for single word'
);

-- Test case 8: Valid with underscore
SELECT ok(
    pgflow.is_valid_slug('valid_slug'),
    'is_valid_slug returns true for string with underscore'
);

-- Test case 9: Valid with numbers (not at start)
SELECT ok(
    pgflow.is_valid_slug('valid123'),
    'is_valid_slug returns true for string with numbers not at start'
);

-- Test case 10: Valid mixed case
SELECT ok(
    pgflow.is_valid_slug('validSlug'),
    'is_valid_slug returns true for mixed case string'
);

SELECT finish();
ROLLBACK;
