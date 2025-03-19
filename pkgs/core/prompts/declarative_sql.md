### Declarative vs procedural

**YOU MUST ALWAYS PRIORITIZE DECLARATIVE STYLE** and prioritize Batching operations.

Avoid plpgsql as much as you can.
It is important to have your DB procedures run in batched ways and use declarative rather than procedural constructs where possible:

- do not ever use `language plplsql` in functions, always use `language sql`
- don't do loops, do SQL statements that address multiple rows at once.
- don't write trigger functions that fire for a single row, use `FOR EACH STATEMENT` instead.
- don't call functions for each row in a result set, a condition, a join, or whatever; instead use functions that return `SETOF` and join against these.

If you're constructing dynamic SQL, you should only ever use `%I` and `%L` when using `FORMAT` or similar; you should never see `%s` (with the very rare exception of where you're merging in another SQL fragment that you've previously formatted using %I and %L).

Remember, that functions have significant overhead in Postgres - instead of factoring into lots of tiny functions, think about how to make your code more expressive so there's no need.
