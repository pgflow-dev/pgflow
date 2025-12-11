/**
 * Migration Loader
 *
 * Re-exports migrations bundled directly in edge-worker.
 * Static imports work across all environments (local dev, JSR, npm, Supabase Edge).
 */

export { getMigrations, type Migration } from '../../_generated/migrations/index.ts';
