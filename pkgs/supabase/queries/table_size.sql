-- List all tables in the `public` schema, showing:
--   - the total size (including associated indexes and TOAST tables)
--   - the size of the table data alone, and the size of the indexes.
--
--    table_name    | total_size | table_size | index_size
-- -----------------+------------+------------+------------
--  documents       | 5440 kB    | 4416 kB    | 1024 kB
--  edulaw_acts     | 16 kB      | 0 bytes    | 16 kB
--  edulaw_articles | 16 kB      | 0 bytes    | 16 kB
--  edulaw_sections | 16 kB      | 0 bytes    | 16 kB
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
  pg_size_pretty(pg_total_relation_size(relid)/ count(relid.*)) AS total_size
FROM
  pg_catalog.pg_statio_user_tables
WHERE
  schemaname = 'public'
ORDER BY
  pg_total_relation_size(relid) DESC;


-- Size of each index separately, you can use the following query:
--
--       index_name      |   table_name    | index_size
-- ----------------------+-----------------+------------
--  documents_pkey       | documents       | 128 kB
--  edulaw_acts_pkey     | edulaw_acts     | 8192 bytes
--  edulaw_articles_pkey | edulaw_articles | 8192 bytes
--  edulaw_sections_pkey | edulaw_sections | 8192 bytes
SELECT
  idx.indexrelid::regclass AS index_name,
  tbl.relname AS table_name,
  pg_size_pretty(pg_relation_size(idx.indexrelid)) AS index_size
FROM
  pg_catalog.pg_index idx
JOIN
  pg_catalog.pg_class tbl ON idx.indrelid = tbl.oid
JOIN
  pg_catalog.pg_namespace ns ON tbl.relnamespace = ns.oid
WHERE
  ns.nspname = 'public'
ORDER BY
  pg_relation_size(idx.indexrelid) DESC;
