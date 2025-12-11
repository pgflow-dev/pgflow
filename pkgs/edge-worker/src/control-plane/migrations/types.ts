// Re-export Migration from local generated migrations
export type { Migration } from '../../_generated/migrations/types.ts';

/**
 * Status of a migration in the installer tracking table
 */
export type MigrationStatus = 'pending' | 'applied';

/**
 * Migration with its current status
 */
export interface MigrationWithStatus {
  timestamp: string;
  filename: string;
  status: MigrationStatus;
}

/**
 * Result of applying a single migration
 */
export interface MigrationApplyResult {
  timestamp: string;
  status: 'applied' | 'skipped';
}

/**
 * Result of the up() operation
 */
export interface ApplyResult {
  success: boolean;
  applied: number;
  skipped: number;
  total: number;
  results: MigrationApplyResult[];
  error?: string;
}
