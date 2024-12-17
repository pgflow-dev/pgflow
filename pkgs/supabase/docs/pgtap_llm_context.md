I’m ok, you’re not ok

The basic purpose of pgTAP—and of any TAP-emitting test framework, for that matter—is to print out either “ok #” or “not ok #”, depending on whether a given test succeeded or failed. Everything else is just gravy.

All of the following functions return “ok” or “not ok” depending on whether the test succeeded or failed.
ok()

SELECT ok( :boolean, :description );
SELECT ok( :boolean );

Parameters

:boolean
    A boolean value indicating success or failure.
:description
    A short description of the test.

This function simply evaluates any boolean expression and uses it to determine if the test succeeded or failed. A true expression passes, a false one fails. Very simple.

For example:

SELECT ok( 9 ^ 2 = 81,    'simple exponential' );
SELECT ok( 9 < 10,        'simple comparison' );
SELECT ok( 'foo' ~ '^f',  'simple regex' );
SELECT ok( active = true, name ||  widget active' )
  FROM widgets;

(Mnemonic: “This is ok.”)

The :description is a very short description of the test that will be printed out. It makes it very easy to find a test in your script when it fails and gives others an idea of your intentions. The description is optional, but we very strongly encourage its use.

Should an ok() fail, it will produce some diagnostics:

not ok 18 - sufficient mucus
#     Failed test 18: "sufficient mucus"

Furthermore, should the boolean test result argument be passed as a NULL rather than true or false, ok() will assume a test failure and attach an additional diagnostic:

not ok 18 - sufficient mucus
#     Failed test 18: "sufficient mucus"
#     (test result was NULL)

is()
isnt()

SELECT is(   :have, :want, :description );
SELECT is(   :have, :want );
SELECT isnt( :have, :want, :description );
SELECT isnt( :have, :want );

Parameters

:have
    Value to test.
:want
    Value that :have is expected to be. Must be the same data type.
:description
    A short description of the test.

Similar to ok(), is() and isnt() compare their two arguments with IS NOT DISTINCT FROM (=) AND IS DISTINCT FROM (<>) respectively and use the result of that to determine if the test succeeded or failed. So these:

-- Is the ultimate answer 42?
SELECT is( ultimate_answer(), 42, 'Meaning of Life' );

-- foo() doesn't return empty
SELECT isnt( foo(), '', 'Got some foo' );

are similar to these:

SELECT ok( ultimate_answer() =  42, 'Meaning of Life' );
SELECT ok( foo() <> '', 'Got some foo' );

(Mnemonic: “This is that.” “This isn’t that.”)

Note: Thanks to the use of the IS [ NOT ] DISTINCT FROM construct, NULLs are not treated as unknowns by is() or isnt(). That is, if :have and :want are both NULL, the test will pass, and if only one of them is NULL, the test will fail.

So why use these test functions? They produce better diagnostics on failure. ok() cannot know what you are testing for (beyond the description), but is() and isnt() know what the test was and why it failed. For example this test:

\set foo '\'waffle\''
\set bar '\'yarblokos\''
SELECT is( :foo::text, :bar::text, 'Is foo the same as bar?' );

Will produce something like this:

# Failed test 17:  "Is foo the same as bar?"
#         have: waffle
#         want: yarblokos

So you can figure out what went wrong without re-running the test.

You are encouraged to use is() and isnt() over ok() where possible. You can even use them to compare records:

SELECT is( users.*, ROW(1, 'theory', true)::users )
  FROM users
 WHERE nick = 'theory';

matches()

SELECT matches( :have, :regex, :description );
SELECT matches( :have, :regex );

Parameters

:have
    Value to match.
:regex
    A regular expression.
:description
    A short description of the test.

Similar to ok(), matches() matches :have against the regex :regex.

So this:

SELECT matches( :this, '^that', 'this is like that' );

is similar to:

SELECT ok( :this ~ '^that', 'this is like that' );

(Mnemonic “This matches that”.)

Its advantages over ok() are similar to that of is() and isnt(): Better diagnostics on failure.
imatches()

SELECT imatches( :have, :regex, :description );
SELECT imatches( :have, :regex );

Parameters

:have
    Value to match.
:regex
    A regular expression.
:description
    A short description of the test.

Just like matches() except that the regular expression is compared to :have case-insensitively.
doesnt_match()
doesnt_imatch()

SELECT doesnt_match(  :have, :regex, :description );
SELECT doesnt_match(  :have, :regex );
SELECT doesnt_imatch( :have, :regex, :description );
SELECT doesnt_imatch( :have, :regex );

Parameters

:have
    Value to match.
:regex
    A regular expression.
:description
    A short description of the test.

These functions work exactly as matches() and imatches() do, only they check if :have does not match the given pattern.
alike()
ialike()

SELECT alike(  :this, :like, :description );
SELECT alike(  :this, :like );
SELECT ialike( :this, :like, :description );
SELECT ialike( :this, :like );

Parameters

:have
    Value to match.
:like
    A SQL LIKE pattern.
:description
    A short description of the test.

Similar to matches(), alike() matches :have against the SQL LIKE pattern :like. ialike() matches case-insensitively.

So this:

SELECT ialike( :have, 'that%', 'this is alike that' );

is similar to:

SELECT ok( :have ILIKE 'that%', 'this is like that' );

(Mnemonic “This is like that”.)

Its advantages over ok() are similar to that of is() and isnt(): Better diagnostics on failure.
unalike()
unialike()

SELECT unalike(  :this, :like, :description );
SELECT unalike(  :this, :like );
SELECT unialike( :this, :like, :description );
SELECT unialike( :this, :like );

Parameters

:have
    Value to match.
:like
    A SQL LIKE pattern.
:description
    A short description of the test.

Works exactly as alike(), only it checks if :have does not match the given pattern.
cmp_ok()

SELECT cmp_ok( :have, :op, :want, :description );
SELECT cmp_ok( :have, :op, :want );

Parameters

:have
    Value to compare.
:op
    An SQL operator specified as a string.
:want
    Value to compare to :have using the :op operator.
:description
    A short description of the test.

Halfway between ok() and is() lies cmp_ok(). This function allows you to compare two arguments using any binary operator.

-- ok( :have = :want );
SELECT cmp_ok( :have, '=', :want, 'this = that' );

-- ok( :have >= :want );
SELECT cmp_ok( :have, '>=', :want, 'this >= that' );

-- ok( :have && :want );
SELECT cmp_ok( :have, '&&', :want, 'this && that' );

Its advantage over ok() is that when the test fails you’ll know what :have and :want were:

not ok 1
#     Failed test 1:
#     '23'
#         &&
#     NULL

Note that if the value returned by the operation is NULL, the test will be considered to have failed. This may not be what you expect if your test was, for example:

SELECT cmp_ok( NULL, '=', NULL );

But in that case, you should probably use is(), instead.
pass()
fail()

SELECT pass( :description );
SELECT pass( );
SELECT fail( :description );
SELECT fail( );

Parameters

:description
    A short description of the test.

Sometimes you just want to say that the tests have passed. Usually the case is you’ve got some complicated condition that is difficult to wedge into an ok(). In this case, you can simply use pass() (to declare the test ok) or fail() (for not ok). They are synonyms for ok(1) and ok(0).

Use these functions very, very, very sparingly.
isa_ok()

SELECT isa_ok( :have, :regtype, :name );
SELECT isa_ok( :have, :regtype );

Parameters

:have
    Value to check the type of.
:regtype
    Name of an SQL data type.
:name
    A name for the value being compared.

Checks to see if the given value is of a particular type. The description and diagnostics of this test normally just refer to “the value”. If you’d like them to be more specific, you can supply a :name. For example you might say “the return value” when you’re examining the result of a function call:

SELECT isa_ok( length('foo'), 'integer', 'The return value from length()' );

In which case the description will be “The return value from length() isa integer”.

In the event of a failure, the diagnostic message will tell you what the type of the value actually is:

not ok 12 - the value isa integer[]
#     the value isn't a "integer[]" it's a "boolean"

Pursuing Your Query

Sometimes, you’ve just gotta test a query. I mean the results of a full blown query, not just the scalar assertion functions we’ve seen so far. pgTAP provides a number of functions to help you test your queries, each of which takes one or two SQL statements as arguments. For example:

SELECT throws_ok('SELECT divide_by(0)');

Yes, as strings. Of course, you’ll often need to do something complex in your SQL, and quoting SQL in strings in what is, after all, an SQL application, is an unnecessary PITA. Each of the query-executing functions in this section thus support an alternative to make your tests more SQLish: using prepared statements.

Prepared statements allow you to just write SQL and simply pass the prepared statement names to test functions. For example, the above example can be rewritten as:

PREPARE mythrow AS SELECT divide_by(0);
SELECT throws_ok('mythrow');

pgTAP assumes that an SQL argument without space characters or starting with a double quote character is a prepared statement and simply EXECUTEs it. If you need to pass arguments to a prepared statement, perhaps because you plan to use it in multiple tests to return different values, just EXECUTE it yourself. Here’s an example with a prepared statement with a space in its name, and one where arguments need to be passed:

PREPARE "my test" AS SELECT * FROM active_users() WHERE name LIKE 'A%';
PREPARE expect AS SELECT * FROM users WHERE active = $1 AND name LIKE $2;

SELECT results_eq(
    '"my test"',
    'EXECUTE expect( true, ''A%'' )'
);

Since “my test” was declared with double quotes, it must be passed with double quotes. And since the call to “expect” included spaces (to keep it legible), the EXECUTE keyword was required.

You can also use a VALUES statement, both in the query string or in a prepared statement. A useless example:

PREPARE myvals AS VALUES (1, 2), (3, 4);
SELECT set_eq(
    'myvals',
    'VALUES (1, 2), (3, 4)'
);

Here’s a bonus if you need to check the results from a query that returns a single column: for those functions that take two query arguments, the second can be an array. Check it out:

SELECT results_eq(
    'SELECT * FROM active_user_ids()',
    ARRAY[ 2, 3, 4, 5]
);

The first query must return only one column of the same type as the values in the array. If you need to test more columns, you’ll need to use two queries.

Keeping these techniques in mind, read on for all of the query-testing goodness.
To Error is Human

Sometimes you just want to know that a particular query will trigger an error. Or maybe you want to make sure a query does not trigger an error. For such cases, we provide a couple of test functions to make sure your queries are as error-prone as you think they should be.
throws_ok()

SELECT throws_ok( :sql, :errcode, :ermsg, :description );
SELECT throws_ok( :sql, :errcode, :ermsg );
SELECT throws_ok( :sql, :errcode );
SELECT throws_ok( :sql, :errmsg, :description );
SELECT throws_ok( :sql, :errmsg );
SELECT throws_ok( :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:errcode
    A PostgreSQL error code
:errmsg
    An error message.
:description
    A short description of the test.

When you want to make sure that an exception is thrown by PostgreSQL, use throws_ok() to test for it.

The first argument should be the name of a prepared statement or else a string representing the query to be executed (see the summary for query argument details). throws_ok() will use the PL/pgSQL EXECUTE statement to execute the query and catch any exception.

The second argument should be an exception error code, which is a five-character string (if it happens to consist only of numbers and you pass it as an integer, it will still work). If this value is not NULL, throws_ok() will check the thrown exception to ensure that it is the expected exception. For a complete list of error codes, see Appendix A. in the PostgreSQL documentation.

The third argument is an error message. This will be most useful for functions you’ve written that raise exceptions, so that you can test the exception message that you’ve thrown. Otherwise, for core errors, you’ll need to be careful of localized error messages. One trick to get around localized error messages is to pass NULL as the third argument. This allows you to still pass a description as the fourth argument.

The fourth argument is of course a brief test description. Here’s a useful example:

PREPARE my_thrower AS INSERT INTO try (id) VALUES (1);
SELECT throws_ok(
    'my_thrower',
    '23505',
    'duplicate key value violates unique constraint "try_pkey"',
    'We should get a unique violation for a duplicate PK'
);

For the two- and three-argument forms of throws_ok(), if the second argument is exactly five bytes long, it is assumed to be an error code and the optional third argument is the error message. Otherwise, the second argument is assumed to be an error message and the third argument is a description. If for some reason you need to test an error message that is five bytes long, use the four-argument form.

A failing throws_ok() test produces an appropriate diagnostic message. For example:

# Failed test 81: "This should die a glorious death"
#       caught: 23505: duplicate key value violates unique constraint "try_pkey"
#       wanted: 23502: null value in column "id" violates not-null constraint

Idea borrowed from the Test::Exception Perl module.
throws_like()
throws_ilike()

SELECT throws_like(  :sql, :like, :description );
SELECT throws_like(  :sql, :like );
SELECT throws_ilike( :sql, :like, :description );
SELECT throws_ilike( :sql, :like );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:like
    An SQL LIKE pattern.
:description
    A short description of the test.

Like throws_ok(), but tests that an exception error message matches an SQL LIKE pattern. The throws_ilike() variant matches case-insensitively. An example:

PREPARE my_thrower AS INSERT INTO try (tz) VALUES ('America/Moscow');
SELECT throws_like(
    'my_thrower',
    '%"timezone_check"',
    'We should error for invalid time zone'
);

A failing throws_like() test produces an appropriate diagnostic message. For example:

# Failed test 85: "We should error for invalid time zone"
#     error message: 'value for domain timezone violates check constraint "tz_check"'
#     doesn't match: '%"timezone_check"'

throws_matching()
throws_imatching()

SELECT throws_matching(  :sql, :regex, :description );
SELECT throws_matching(  :sql, :regex );
SELECT throws_imatching( :sql, :regex, :description );
SELECT throws_imatching( :sql, :regex );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:regex
    A regular expression.
:description
    A short description of the test.

Like throws_ok(), but tests that an exception error message matches a regular expression. The throws_imatching() variant matches case-insensitively. An example:

PREPARE my_thrower AS INSERT INTO try (tz) VALUES ('America/Moscow');
SELECT throws_matching(
    'my_thrower',
    '.+"timezone_check"',
    'We should error for invalid time zone'
);

A failing throws_matching() test produces an appropriate diagnostic message. For example:

# Failed test 85: "We should error for invalid time zone"
#     error message: 'value for domain timezone violates check constraint "tz_check"'
#     doesn't match: '.+"timezone_check"'

lives_ok()

SELECT lives_ok( :sql, :description );
SELECT lives_ok( :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

The inverse of throws_ok(), lives_ok() ensures that an SQL statement does not throw an exception. Pass in the name of a prepared statement or string of SQL code (see the summary for query argument details). The optional second argument is the test description. An example:

SELECT lives_ok(
    'INSERT INTO try (id) VALUES (1)',
    'We should not get a unique violation for a new PK'
);

A failing lives_ok() test produces an appropriate diagnostic message. For example:

# Failed test 85: "don't die, little buddy!"
#         died: 23505: duplicate key value violates unique constraint "try_pkey"

Idea borrowed from the Test::Exception Perl module.
performs_ok()

SELECT performs_ok( :sql, :milliseconds, :description );
SELECT performs_ok( :sql, :milliseconds );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:milliseconds
    Number of milliseconds.
:description
    A short description of the test.

This function makes sure that an SQL statement performs well. It does so by timing its execution and failing if execution takes longer than the specified number of milliseconds. An example:

PREPARE fast_query AS SELECT id FROM try WHERE name = 'Larry';
SELECT performs_ok(
    'fast_query',
    250,
    'A select by name should be fast'
);

The first argument should be the name of a prepared statement or a string representing the query to be executed (see the summary for query argument details). performs_ok() will use the PL/pgSQL EXECUTE statement to execute the query.

The second argument is the maximum number of milliseconds it should take for the SQL statement to execute. This argument is numeric, so you can even use fractions of milliseconds if it floats your boat.

The third argument is the usual description. If not provided, performs_ok() will generate the description “Should run in less than $milliseconds ms”. You’ll likely want to provide your own description if you have more than a couple of these in a test script or function.

Should a performs_ok() test fail it produces appropriate diagnostic messages. For example:

# Failed test 19: "The lookup should be fast!"
#       runtime: 200.266 ms
#       exceeds: 200 ms

Note: There is a little extra time included in the execution time for the the overhead of PL/pgSQL’s EXECUTE, which must compile and execute the SQL string. You will want to account for this and pad your estimates accordingly. It’s best to think of this as a brute force comparison of runtimes, in order to ensure that a query is not really slow (think seconds).
performs_within()

SELECT performs_within( :sql, :average_milliseconds, :within, :iterations, :description );
SELECT performs_within( :sql, :average_milliseconds, :within, :description );
SELECT performs_within( :sql, :average_milliseconds, :within, :iterations);
SELECT performs_within( :sql, :average_milliseconds, :within);

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:average_milliseconds
    Number of milliseconds the query should take on average.
:within
    The number of milliseconds that the average is allowed to vary.
:iterations
    The number of times to run the query.
:description
    A short description of the test.

This function makes sure that an SQL statement, on average, performs within an expected window. It does so by running the query a default of 10 times. It throws out the top and bottom 10% of runs, and averages the middle 80% of the runs it made. If the average execution time is outside the range specified by within, the test will fails. An example:

PREPARE fast_query AS SELECT id FROM try WHERE name = 'Larry';
SELECT performs_within(
    'fast_query',
    250,
    10,
    100,
    'A select by name should be fast'
);

The first argument should be the name of a prepared statement or a string representing the query to be executed (see the summary for query argument details). performs_within() will use the PL/pgSQL EXECUTE statement to execute the query.

The second argument is the average number of milliseconds it should take for the SQL statement to execute. This argument is numeric, so you can even use fractions of milliseconds if it floats your boat.

The third argument is the number of milliseconds the query is allowed to vary around the average and still still pass the test. If the query’s average is falls outside this window, either too fast or too slow, it will fail.

The fourth argument is either the number of iterations or the usual description. If not provided, performs_within() will execute 10 runs of the query and will generate the description “Should run in $average_milliseconds +/- $within ms”. You’ll likely want to provide your own description if you have more than a couple of these in a test script or function.

The fifth argument is the usual description as described above, assuming you’ve also specified the number of iterations.

Should a performs_within() test fail it produces appropriate diagnostic messages. For example:

# Failed test 19: "The lookup should be fast!"
# average runtime: 210.266 ms
# desired average: 200 +/- 10 ms

Note: There is a little extra time included in the execution time for the the overhead of PL/pgSQL’s EXECUTE, which must compile and execute the SQL string. You will want to account for this and pad your estimates accordingly. It’s best to think of this as a brute force comparison of runtimes, in order to ensure that a query is not really slow (think seconds).
Can You Relate?

So you’ve got your basic scalar comparison functions, what about relations? Maybe you have some pretty hairy SELECT statements in views or functions to test? We’ve got your relation-testing functions right here.
results_eq()

SELECT results_eq( :sql,    :sql,    :description );
SELECT results_eq( :sql,    :sql                  );
SELECT results_eq( :sql,    :array,  :description );
SELECT results_eq( :sql,    :array                );
SELECT results_eq( :cursor, :cursor, :description );
SELECT results_eq( :cursor, :cursor               );
SELECT results_eq( :sql,    :cursor, :description );
SELECT results_eq( :sql,    :cursor               );
SELECT results_eq( :cursor, :sql,    :description );
SELECT results_eq( :cursor, :sql                  );
SELECT results_eq( :cursor, :array,  :description );
SELECT results_eq( :cursor, :array                );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:cursor
    A PostgreSQL refcursor value representing a named cursor.
:description
    A short description of the test.

There are three ways to test result sets in pgTAP. Perhaps the most intuitive is to do a direct row-by-row comparison of results to ensure that they are exactly what you expect, in the order you expect. Coincidentally, this is exactly how results_eq() behaves. Here’s how you use it: simply pass in two SQL statements or prepared statement names (or some combination; (see the summary for query argument details) and an optional description. Yep, that’s it. It will do the rest.

For example, say that you have a function, active_users(), that returns a set of rows from the users table. To make sure that it returns the rows you expect, you might do something like this:

SELECT results_eq(
    'SELECT * FROM active_users()',
    'SELECT * FROM users WHERE active',
    'active_users() should return active users'
);

Tip: If you want to hard-code the values to compare, use a VALUES statement instead of a query, like so:

SELECT results_eq(
    'SELECT * FROM active_users()',
    $$VALUES ( 42, 'Anna'), (19, 'Strongrrl'), (39, 'Theory')$$,
    'active_users() should return active users'
);

If the results returned by the first argument consist of a single column, the second argument may be an array:

SELECT results_eq(
    'SELECT * FROM active_user_ids()',
    ARRAY[ 2, 3, 4, 5]
);

In general, the use of prepared statements is highly recommended to keep your test code SQLish (you can even use VALUES in prepared statements). But note that, because results_eq() does a row-by-row comparison, the results of the two query arguments must be in exactly the same order, with exactly the same data types, in order to pass. In practical terms, it means that you must make sure that your results are never unambiguously ordered.

For example, say that you want to compare queries against a persons table. The simplest way to sort is by name, as in:

try=# select * from people order by name;
  name  | age
--------+-----
 Damian |  19
 Larry  |  53
 Tom    |  44
 Tom    |  35
(4 rows)

But a different run of the same query could have the rows in different order:

try=# select * from people order by name;
  name  | age
--------+-----
 Damian |  19
 Larry  |  53
 Tom    |  35
 Tom    |  44
(4 rows)

Notice how the two “Tom” rows are reversed. The upshot is that you must ensure that your queries are always fully ordered. In a case like the above, it means sorting on both the name column and the age column. If the sort order of your results isn’t important, consider using set_eq() or bag_eq() instead.

Internally, results_eq() turns your SQL statements into cursors so that it can iterate over them one row at a time. Conveniently, this behavior is directly available to you, too. Rather than pass in some arbitrary SQL statement or the name of a prepared statement, simply create a cursor and pass it in, like so:

DECLARE cwant CURSOR FOR SELECT * FROM active_users();
DECLARE chave CURSOR FOR SELECT * FROM users WHERE active ORDER BY name;

SELECT results_eq(
    'cwant'::refcursor,
    'chave'::refcursor,
    'Gotta have those active users!'
);

The key is to ensure that the cursor names are passed as refcursors. This allows results_eq() to disambiguate them from prepared statements. And of course, you can mix and match cursors, prepared statements, and SQL as much as you like. Here’s an example using a prepared statement and a (reset) cursor for the expected results:

PREPARE users_test AS SELECT * FROM active_users();
MOVE BACKWARD ALL IN chave;

SELECT results_eq(
    'users_test',
    'chave'::refcursor,
    'Gotta have those active users!'
);

Regardless of which types of arguments you pass, in the event of a test failure, results_eq() will offer a nice diagnostic message to tell you at what row the results differ, something like:

# Failed test 146
#     Results differ beginning at row 3:
#         have: (1,Anna)
#         want: (22,Betty)

If there are different numbers of rows in each result set, a non-existent row will be represented as “NULL”:

# Failed test 147
#     Results differ beginning at row 5:
#         have: (1,Anna)
#         want: NULL

If the number of columns varies between result sets, or if results are of different data types, you’ll get diagnostics like so:

# Failed test 148
#     Number of columns or their types differ between the queries:
#         have: (1)
#         want: (foo,1)

results_ne()

SELECT results_ne( :sql,    :sql,    :description );
SELECT results_ne( :sql,    :sql                  );
SELECT results_ne( :sql,    :array,  :description );
SELECT results_ne( :sql,    :array                );
SELECT results_ne( :cursor, :cursor, :description );
SELECT results_ne( :cursor, :cursor               );
SELECT results_ne( :sql,    :cursor, :description );
SELECT results_ne( :sql,    :cursor               );
SELECT results_ne( :cursor, :sql,    :description );
SELECT results_ne( :cursor, :sql                  );
SELECT results_ne( :cursor, :array,  :description );
SELECT results_ne( :cursor, :array                );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:cursor
    A PostgreSQL refcursor value representing a named cursor.
:description
    A short description of the test.

The inverse of results_eq(), this function tests that query results are not equivalent. Note that, like results_ne(), order matters, so you can actually have the same sets of results in the two query arguments and the test will pass if they’re merely in a different order. More than likely what you really want is results_eq() or set_ne(). But this function is included for completeness and is kind of cute, so enjoy. If a results_ne() test fails, however, there will be no diagnostics, because, well, the results will be the same!
set_eq()

SELECT set_eq( :sql, :sql,   :description );
SELECT set_eq( :sql, :sql                 );
SELECT set_eq( :sql, :array, :description );
SELECT set_eq( :sql, :array               );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:description
    A short description of the test.

Sometimes you don’t care what order query results are in, or if there are duplicates. In those cases, use set_eq() to do a simple set comparison of your result sets. As long as both queries return the same records, regardless of duplicates or ordering, a set_eq() test will pass.

The SQL arguments can be the names of prepared statements or strings containing an SQL query (see the summary for query argument details), or even one of each. If the results returned by the first argument consist of a single column, the second argument may be an array:

SELECT set_eq(
    'SELECT * FROM active_user_ids()',
    ARRAY[ 2, 3, 4, 5]
);

In whatever case you choose to pass arguments, a failing test will yield useful diagnostics, such as:

# Failed test 146
#     Extra records:
#         (87,Jackson)
#         (1,Jacob)
#     Missing records:
#         (44,Anna)
#         (86,Angelina)

In the event that you somehow pass queries that return rows with different types of columns, pgTAP will tell you that, too:

# Failed test 147
#     Columns differ between queries:
#         have: (integer,text)
#         want: (text,integer)

This of course extends to sets with different numbers of columns:

# Failed test 148
#     Columns differ between queries:
#         have: (integer)
#         want: (text,integer)

set_ne()

SELECT set_ne( :sql, :sql,   :description );
SELECT set_ne( :sql, :sql                 );
SELECT set_ne( :sql, :array, :description );
SELECT set_ne( :sql, :array               );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:description
    A short description of the test.

The inverse of set_eq(), this function tests that the results of two queries are not the same. The two queries can as usual be the names of prepared statements or strings containing an SQL query (see the summary for query argument details), or even one of each. The two queries, however, must return results that are directly comparable — that is, with the same number and types of columns in the same orders. If it happens that the query you’re testing returns a single column, the second argument may be an array.
set_has()

SELECT set_has( :sql, :sql, :description );
SELECT set_has( :sql, :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

When you need to test that a query returns at least some subset of records, set_has() is the hammer you’re looking for. It tests that the the results of a query contain at least the results returned by another query, if not more. That is, the test passes if the second query’s results are a subset of the first query’s results. The second query can even return an empty set, in which case the test will pass no matter what the first query returns. Not very useful perhaps, but set-theoretically correct.

As with set_eq(). the SQL arguments can be the names of prepared statements or strings containing an SQL query (see the summary for query argument details), or one of each. If it happens that the query you’re testing returns a single column, the second argument may be an array.

In whatever case, a failing test will yield useful diagnostics just like:

# Failed test 122
#     Missing records:
#         (44,Anna)
#         (86,Angelina)

As with set_eq(), set_has() will also provide useful diagnostics when the queries return incompatible columns. Internally, it uses an EXCEPT query to determine if there any any unexpectedly missing results.
set_hasnt()

SELECT set_hasnt( :sql, :sql, :description );
SELECT set_hasnt( :sql, :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

This test function is the inverse of set_has(): the test passes when the results of the first query have none of the results of the second query. Diagnostics are similarly useful:

# Failed test 198
#     Extra records:
#         (44,Anna)
#         (86,Angelina)

Internally, the function uses an INTERSECT query to determine if there is any unexpected overlap between the query results.
bag_eq()

SELECT bag_eq( :sql, :sql,   :description );
SELECT bag_eq( :sql, :sql                 );
SELECT bag_eq( :sql, :array, :description );
SELECT bag_eq( :sql, :array               );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:description
    A short description of the test.

The bag_eq() function is just like set_eq(), except that it considers the results as bags rather than as sets. A bag is a set that allows duplicates. In practice, it mean that you can use bag_eq() to test result sets where order doesn’t matter, but duplication does. In other words, if a two rows are the same in the first result set, the same row must appear twice in the second result set.

Otherwise, this function behaves exactly like set_eq(), including the utility of its diagnostics.
bag_ne()

SELECT bag_ne( :sql, :sql,   :description );
SELECT bag_ne( :sql, :sql                 );
SELECT bag_ne( :sql, :array, :description );
SELECT bag_ne( :sql, :array               );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:array
    An array of values representing a single-column row values.
:description
    A short description of the test.

The inverse of bag_eq(), this function tests that the results of two queries are not the same, including duplicates. The two queries can as usual be the names of prepared statements or strings containing an SQL query (see the summary for query argument details), or even one of each. The two queries, however, must return results that are directly comparable — that is, with the same number and types of columns in the same orders. If it happens that the query you’re testing returns a single column, the second argument may be an array.
bag_has()

SELECT bag_has( :sql, :sql, :description );
SELECT bag_has( :sql, :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

The bag_has() function is just like set_has(), except that it considers the results as bags rather than as sets. A bag is a set with duplicates. What practice this means that you can use bag_has() to test result sets where order doesn’t matter, but duplication does. Internally, it uses an EXCEPT ALL query to determine if there any any unexpectedly missing results.
bag_hasnt()

SELECT bag_hasnt( :sql, :sql, :description );
SELECT bag_hasnt( :sql, :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

This test function is the inverse of bag_hasnt(): the test passes when the results of the first query have none of the results of the second query. Diagnostics are similarly useful:

# Failed test 198
#     Extra records:
#         (44,Anna)
#         (86,Angelina)

Internally, the function uses an INTERSECT ALL query to determine if there is any unexpected overlap between the query results. This means that a duplicate row in the first query will appear twice in the diagnostics if it is also duplicated in the second query.
is_empty()

SELECT is_empty( :sql, :description );
SELECT is_empty( :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

The is_empty() function takes a single query string or prepared statement name as its first argument, and tests that said query returns no records. Internally it simply executes the query and if there are any results, the test fails and the results are displayed in the failure diagnostics, like so:

# Failed test 494: "Should have no inactive users"
#     Records returned:
#         (1,Jacob,false)
#         (2,Emily,false)

isnt_empty()

SELECT isnt_empty( :sql, :description );
SELECT isnt_empty( :sql );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:description
    A short description of the test.

This function is the inverse of is_empty(). The test passes if the specified query, when executed, returns at least one row. If it returns no rows, the test fails.
row_eq()

SELECT row_eq( :sql, :record, :description );
SELECT row_eq( :sql, :record );

Parameters

:sql
    An SQL statement or the name of a prepared statement, passed as a string.
:record
    A row or value, also known as a composite type.
:description
    A short description of the test.

Compares the contents of a single row to a record. On PostgreSQL 11 and later, a bare RECORD value may be passed:

SELECT row_eq( $$ SELECT 1, 'foo' $$, ROW(1, 'foo') );

Due to the limitations of non-C functions in earlier versions of PostgreSQL, a bare RECORD value cannot be passed to the function. You must instead pass in a valid composite type value, and cast the record argument (the second argument) to the same type. Both explicitly created composite types and table types are supported. Thus, you can do this:

CREATE TYPE sometype AS (
    id    INT,
    name  TEXT
);

SELECT row_eq( $$ SELECT 1, 'foo' $$, ROW(1, 'foo')::sometype );

And, of course, this:

CREATE TABLE users (
    id   INT,
    name TEXT
);

INSERT INTO users VALUES (1, 'theory');
PREPARE get_user AS SELECT * FROM users LIMIT 1;

SELECT row_eq( 'get_user', ROW(1, 'theory')::users );

Compatible types can be compared, though. So if the users table actually included an active column, for example, and you only wanted to test the id and name, you could do this:

SELECT row_eq(
    $$ SELECT id, name FROM users $$,
    ROW(1, 'theory')::sometype
);

Note the use of the sometype composite type for the second argument. The upshot is that you can create composite types in your tests explicitly for comparing the return values of your queries, if such queries don’t return an existing valid type.

Hopefully someday in the future we’ll be able to support arbitrary record arguments. In the meantime, this is the 90% solution.

Diagnostics on failure are similar to those from is():

# Failed test 322
#       have: (1,Jacob)
#       want: (1,Larry)
