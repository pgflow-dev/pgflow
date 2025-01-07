BEGIN;
SELECT plan(1);

-- Create the function we want to test
CREATE OR REPLACE FUNCTION hello_world()
RETURNS text AS $$
BEGIN
    RETURN 'Hello, World!';
END;
$$ LANGUAGE plpgsql;

SELECT is(
    hello_world(),
    'Hello, World!',
    'hello_world() should return "Hello, World!"'
);

SELECT * FROM finish();
ROLLBACK;
