-- Create schemas
create schema if not exists pgflow;
create schema if not exists edge_worker;

-- it is impossible to use "set search_path = ''" and generate valid migration with atlas
-- so this empty schema is a workaround so i can "set search_path = '_dummy_'",
-- which will make sure that all the objects in function body needs to be fully qualified,
-- and will make atlas happy
create schema if not exists _dummy_;

--------------------------------------------------------------------------
------------------ TODO: fix me, UNSECURE --------------------------------
--------------------------------------------------------------------------
-- Commenting out permissions for Atlas diff
-- grant usage on schema pgflow to anon, authenticated, service_role;
-- grant all on all tables in schema pgflow to anon, authenticated, service_role;
-- grant all on all routines in schema pgflow to anon, authenticated, service_role;
-- grant all on all sequences in schema pgflow to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema pgflow
-- grant all on tables to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema pgflow
-- grant all on routines to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema pgflow
-- grant all on sequences to anon, authenticated, service_role;
