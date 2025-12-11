/**
 * MigrationRunner - Applies pgflow migrations to a database
 *
 * This class handles:
 * - Creating the pgflow_installer schema and tracking table
 * - Listing migration status (pending/applied)
 * - Applying pending migrations with advisory locking
 */

import type postgres from 'postgres';
import { getMigrations } from './loader.ts';
import type { MigrationWithStatus, ApplyResult, MigrationApplyResult } from './types.ts';

// Advisory lock key for migration serialization
// Using a fixed key to ensure only one migration runs at a time
const MIGRATION_LOCK_KEY = 0x706766_6c6f77; // 'pgflow' in hex

export class MigrationRunner {
  constructor(private sql: postgres.Sql) {}

  /**
   * Lists all migrations with their current status (pending/applied)
   */
  async list(): Promise<MigrationWithStatus[]> {
    const migrations = await getMigrations();
    await this.ensureInstallerSchema();
    const appliedSet = await this.getAppliedTimestamps();

    return migrations.map((m) => ({
      timestamp: m.timestamp,
      filename: m.filename,
      status: appliedSet.has(m.timestamp) ? 'applied' : 'pending',
    }));
  }

  /**
   * Applies all pending migrations
   * Each migration runs in its own transaction with advisory locking
   */
  async up(): Promise<ApplyResult> {
    const migrations = await getMigrations();
    await this.ensureInstallerSchema();
    const appliedSet = await this.getAppliedTimestamps();

    const results: MigrationApplyResult[] = [];
    let applied = 0;
    let skipped = 0;

    for (const migration of migrations) {
      if (appliedSet.has(migration.timestamp)) {
        results.push({ timestamp: migration.timestamp, status: 'skipped' });
        skipped++;
        continue;
      }

      try {
        // Run each migration in its own transaction with advisory lock
        await this.sql.begin(async (tx) => {
          // Acquire advisory lock (released at transaction end)
          await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;

          // Double-check migration hasn't been applied (race condition protection)
          const existing = await tx`
            SELECT 1 FROM pgflow_installer.migrations
            WHERE timestamp = ${migration.timestamp}
          `;

          if (existing.length > 0) {
            // Another process applied it while we were waiting for lock
            return;
          }

          // Execute migration SQL
          // SECURITY: migration.content comes from @pgflow/core package bundled at build time.
          // This is trusted code from our own package. Do NOT allow user-provided migration content.
          await tx.unsafe(migration.content);

          // Record that migration was applied
          await tx`
            INSERT INTO pgflow_installer.migrations (timestamp)
            VALUES (${migration.timestamp})
          `;
        });

        results.push({ timestamp: migration.timestamp, status: 'applied' });
        applied++;
      } catch (error) {
        // Migration failed - return partial results with error
        return {
          success: false,
          applied,
          skipped,
          total: migrations.length,
          results,
          error: `Failed at ${migration.timestamp}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }

    return {
      success: true,
      applied,
      skipped,
      total: migrations.length,
      results,
    };
  }

  /**
   * Ensures the installer schema and tracking table exist
   */
  private async ensureInstallerSchema(): Promise<void> {
    await this.sql`CREATE SCHEMA IF NOT EXISTS pgflow_installer`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS pgflow_installer.migrations (
        timestamp TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }

  /**
   * Gets the set of already-applied migration timestamps
   */
  private async getAppliedTimestamps(): Promise<Set<string>> {
    const rows = await this.sql<{ timestamp: string }[]>`
      SELECT timestamp FROM pgflow_installer.migrations
    `;
    return new Set(rows.map((r) => r.timestamp));
  }
}
