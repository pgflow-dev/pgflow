-- Create schemas
create schema if not exists pgflow;

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
