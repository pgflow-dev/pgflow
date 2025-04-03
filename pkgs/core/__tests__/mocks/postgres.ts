import { vi } from 'vitest';

/**
 * Mock implementation for the postgres module
 * This prevents real database connections during tests
 */
export function setupPostgresMock() {
  // Create a properly typed SQL client with methods
  type SqlClient = {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    json: (data: unknown) => string;
    begin: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    end: () => Promise<void>;
  };

  // Create the main postgres function that returns the SQL client
  const sql = vi.fn(() => {
    // Create a complete mock SQL client with all required methods
    const sqlClient = Object.assign(
      vi.fn(() => Promise.resolve(['empty response'])),
      {
        json: vi.fn((data: unknown) => JSON.stringify(data)),
        begin: vi.fn(() => Promise.resolve()),
        commit: vi.fn(() => Promise.resolve()),
        rollback: vi.fn(() => Promise.resolve()),
        end: vi.fn(() => Promise.resolve()),
      }
    ) as SqlClient;

    return sqlClient;
  });

  // Return an object with a default key since postgres is imported as a default export
  return { default: sql };
}
