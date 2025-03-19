# JSON Schemas

JSON schemas can be inferred from the steps `input` types,
so it is relatively easy to build a JSON schema for each step input.

The same goes for the JSON Schema for the flow input.

## Schema storage

Schemas should be stored in the `pgflow.flows` and `pgflow.steps` tables.

## Schemas in versioning

To make sure that slight changes in the input/output types of steps
trigger a new version of the flow, we need to use the inferred schemas
when generating a version hash of the flow.

## Schemas as validation

We can use schemas to do data validation for step handlers:

1. Task executors can validate the runtime input payloads for handler
   and their output results against the schema.
2. Core SQL engine can use `pg_jsonschema` to validate the input values to flows
   and maybe the input values to steps and fail steps if they don't match.

## Problems

Doing any JSON Schema validation in database is probably not a good idea because
of performance impact it would have.

Using runtime validation in Task Executors is probably good enough,
with exception of validating the Flow input - you start flows less often than
steps and it seems like a good idea to validate the input database-wise.


