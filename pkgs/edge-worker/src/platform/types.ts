/**
 * Basic logger interface used throughout the application
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Type for platform-specific environment variables
 */
export interface PlatformEnvironment {
  executionId: string;
  logLevel: string;
  connectionString: string;
  // Add other environment variables as needed
}

/**
 * Common interface for all platform adapters
 */
export interface PlatformAdapter {
  /**
   * Initialize the platform adapter
   */
  initialize(): Promise<void>;
  
  /**
   * Clean up resources when shutting down
   */
  terminate(): Promise<void>;
  
  /**
   * Get platform-specific environment variables
   */
  getEnv(): PlatformEnvironment;
  
  /**
   * Create a logger for a specific module/component
   */
  createLogger(module: string): Logger;
}
