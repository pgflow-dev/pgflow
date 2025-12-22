import type postgres from 'postgres';

/**
 * Platform-specific resources needed by workers
 * This interface abstracts platform concerns from the worker implementation
 */
export interface PlatformResources {
  /**
   * Environment variables
   */
  env: Record<string, string | undefined>;

  /**
   * Factory function to create SQL clients
   * Can return shared or new instances based on max connections
   */
  sqlFactory(max?: number): postgres.Sql;
  
  /**
   * Signal that fires when the platform is shutting down
   */
  shutdownSignal: AbortSignal;
  
  // Future additions:
  // kv(): KVNamespace;
  // objectStore(): R2Bucket;
}