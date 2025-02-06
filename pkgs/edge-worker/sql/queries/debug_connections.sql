WITH pg_conns AS (
  SELECT
    state,
    count(*) AS count,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
  FROM pg_stat_activity
  WHERE application_name = 'supavisor'
  GROUP BY state
),
client_conns AS (
  SELECT
    state,
    count(*) AS count,
    (SELECT current_setting('supavisor.max_client_connections')::int) AS max_client_connections
  FROM supavisor_clients
  GROUP BY state
)
SELECT
  'from_supavisor_to_postgres' AS connection_type,
  state,
  count,
  max_connections,
  round(count::numeric * 100 / max_connections, 2) AS percent_of_limit
FROM pg_conns
UNION ALL
SELECT
  'to_supavisor' AS connection_type,
  state,
  count,
  max_client_connections,
  round(count::numeric * 100 / max_client_connections, 2) AS percent_of_limit
FROM client_conns;
