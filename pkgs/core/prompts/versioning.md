# Versioning

Because users can change Flow definitions for already deployed/inserted flows,
we need a way to version them, so we can distinguish between different
versions of the same flow.

The ides for versioning is very simple:

1. Topologically sort the flow definition, so it is deterministically ordered.
1. Optionally include the JSON schema for each of the steps payloads.
1. Convert this to string representation
1. Use some hashing function to create a hash of the flow.
1. Save the hash in the `pgflow.flows` table in `version` column.

This way we can store the `version` in all the related tables and in payload
sent to task executor.

This `version` can be used to distinguis payloads for older, outdated flows.

## Deployments

The simplest way to support deploying new versions of flows would be to
deploy new task processors for new versions and wait for the old ones
to process their remaining tasks before removing them.

## Problems

### Code duplication

In order to support multiple versions of the same flow at least for a while,
users would need to duplicate any code that changed, so the old versions
can still be executed.

This can be confusing but is probably unavoidable.

### Referencing versions

We should probably keep `created_at` and `version` columns in the `pgflow.flows`,
so users can start new runs without specifying the version - if it is skipped,
the latest version will be used.
