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

  /** Max retries when waiting for server to be ready (default: 30) */
  get serverReadyMaxRetries() {
    const envValue = Deno.env.get('E2E_SERVER_READY_MAX_RETRIES');
    return envValue ? parseInt(envValue, 10) : 30;
  },

  /** Delay between retries in ms (default: 1000) */
  get serverReadyRetryDelayMs() {
    const envValue = Deno.env.get('E2E_SERVER_READY_RETRY_DELAY_MS');
    return envValue ? parseInt(envValue, 10) : 1000;
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

/**
 * Clean database test configuration
 * Uses Docker Compose database WITHOUT pgflow migrations (port 5433)
 * For testing migration installer functionality
 */
export const cleanDbConfig = {
  get dbUrl() {
    return 'postgresql://postgres:postgres@127.0.0.1:5433/postgres';
  },
};
