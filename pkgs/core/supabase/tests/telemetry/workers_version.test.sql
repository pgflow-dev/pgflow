begin;
select plan(2);

select pgflow_tests.reset_db();

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'pgflow'
      and table_name = 'workers'
      and column_name = 'pgflow_version'
  ),
  'workers.pgflow_version column exists'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'pgflow'
      and table_name = 'workers'
      and column_name = 'pgflow_version'
  ),
  'YES',
  'pgflow_version is nullable so existing rows survive'
);

select finish();
rollback;
