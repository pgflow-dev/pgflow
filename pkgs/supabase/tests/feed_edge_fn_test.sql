BEGIN;
SELECT plan(2);

SELECT is(
    jsonb_typeof(("feed"."edge_fn"('embed', '{"input": "hello world"}'::jsonb))::jsonb),
    'array'::text,
    'edge_fn should return an object with a key "output" that is an array'
);
SELECT is(
    jsonb_typeof(("feed"."edge_fn"('infer-metadata', '{"input": "hello world"}'::jsonb))::jsonb),
    'object'::text,
    'edge_fn should return an object with a key "output" that is a jsonb object'
);

SELECT * FROM finish();
ROLLBACK;
