-- Start transaction
BEGIN;

-- Load pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests
SELECT plan(2);

-- Create the function we want to test
CREATE OR REPLACE FUNCTION hello_world()
RETURNS text AS $$
BEGIN
    RETURN 'Hello, World!';
END;
$$ LANGUAGE plpgsql;

-- Test 1: Check if function exists
SELECT has_function(
    'hello_world',
    'Function hello_world() should exist'
);

-- Test 2: Check if function returns correct string
SELECT is(
    hello_world(),
    'Hello, World!',
    'hello_world() should return "Hello, World!"'
);

-- Finish the tests
SELECT * FROM finish();

-- Rollback transaction
ROLLBACK;
