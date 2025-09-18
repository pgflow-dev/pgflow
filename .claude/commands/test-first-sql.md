Your job is to implement the feature below in a test-first manner.
First, you must idenfity what things you want to test for.
Then you must write one test at a time, from the simplest, more generic,
to more precise (if applicable, sometimes you only need to write one test per
thing, without multiple per thing).

To run the test(s), run this command from `pkgs/core` directory:

`scripts/run-test-with-colors supabase/tests/<testfile>`

The newly written test must fail for the correct reasons.

In order to make the test pass, you need to update function
code in pkgs/core/schemas/.

After updating you should use `psql` to execute function file
and update function in database.

!`pnpm nx supabase:status core --output env | grep DB_URL`
PWD: !`pwd`

Repeat until all the added tests are passing.

When they do, run all the tests like this:

`scripts/run-test-with-colors supabase/tests/`

Do not create any migratons or try to run tests with nx.

Never use any INSERTs or UPDATEs to prepare or mutate state for the test.
Instead, use regular pgflow.\* SQL functions or functions that are
available in pkgs/core/supabase/tests/seed.sql:

!`grep 'function.*pgflow_tests' pkgs/core/supabase/seed.sql -A7`

Check how they are used in other tests.

<feature_to_implement>
$ARGUMENTS
</feature_to_implement>
