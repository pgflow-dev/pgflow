/**
 * Test configuration - single source of truth for URLs and connection strings
 *
 * Values are hardcoded for now. In future, could run `supabase status -o json`
 * to get dynamic values.
 *
 * Ports match those defined in supabase/config.toml
 */

/**
 * E2E test configuration
 * Uses Supabase instance (same as edge functions connect to)
 */
export const e2eConfig = {
  get apiUrl() {
    return 'http://127.0.0.1:50321';
  },

  get dbUrl() {
    return 'postgresql://postgres:postgres@127.0.0.1:50322/postgres';
  },
};

/**
 * Integration test configuration
 * Uses Docker Compose database (port 5432)
 */
export const integrationConfig = {
  get dbUrl() {
    return 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  },
};
