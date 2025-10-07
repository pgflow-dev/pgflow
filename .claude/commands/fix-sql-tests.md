Your job is to fix SQL tests, either by fixing the tests if those are invalid,
or updating the SQL functions in pkgs/core/schemas/ and trying again.

If updating functions, load them with psql.

!`pnpm nx supabase:status core --output env | grep DB_URL`
PWD: !`pwd`

To rerun the test(s), run this command from `pkgs/core` directory:

`scripts/run-test-with-colors supabase/tests/<testfile>`

Do not create any migratons or try to run tests with nx.

<test_failures>
!`pnpm nx test:pgtap core`
</test_failures>
