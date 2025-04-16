import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { copyMigrations } from '../../../src/commands/install/copy-migrations';

// Mock the modules
vi.mock('fs');
vi.mock('path');
vi.mock('@clack/prompts', () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
  },
  confirm: vi.fn(),
  note: vi.fn(),
}));
vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

describe('copyMigrations', () => {
  const mockRequire = {
    resolve: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mocks
    (createRequire as any).mockReturnValue(mockRequire);
    mockRequire.resolve.mockReturnValue(
      '/mock/path/to/@pgflow/core/package.json'
    );

    (path.dirname as any).mockReturnValue('/mock/path/to/@pgflow/core');
    (path.join as any).mockImplementation((...args) => args.join('/'));

    (fs.existsSync as any).mockImplementation((path) => {
      if (path === '/mock/path/to/@pgflow/core/dist/supabase/migrations') {
        return true;
      }
      if (path === 'mock/supabase/path/migrations') {
        return true;
      }
      return false;
    });

    (fs.readdirSync as any).mockReturnValue([
      '001_migration.sql',
      '002_migration.sql',
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly resolve migrations from @pgflow/core package', async () => {
    // Mock confirm to return true
    const confirmMock = vi.fn().mockResolvedValue(true);
    (require('@clack/prompts') as any).confirm = confirmMock;

    await copyMigrations({ supabasePath: 'mock/supabase/path' });

    // Verify that createRequire was called with import.meta.url
    expect(createRequire).toHaveBeenCalled();

    // Verify that require.resolve was called with '@pgflow/core/package.json'
    expect(mockRequire.resolve).toHaveBeenCalledWith(
      '@pgflow/core/package.json'
    );

    // Verify that path.dirname was called with the resolved package.json path
    expect(path.dirname).toHaveBeenCalledWith(
      '/mock/path/to/@pgflow/core/package.json'
    );

    // Verify that path.join was called to construct the migrations path
    expect(path.join).toHaveBeenCalledWith(
      '/mock/path/to/@pgflow/core',
      'dist',
      'supabase',
      'migrations'
    );
  });

  it('should handle missing migrations directory gracefully', async () => {
    // Mock fs.existsSync to return false for the migrations directory
    (fs.existsSync as any).mockImplementation((path) => {
      if (path === '/mock/path/to/@pgflow/core/dist/supabase/migrations') {
        return false;
      }
      return true;
    });

    const result = await copyMigrations({ supabasePath: 'mock/supabase/path' });

    // Should return false when migrations directory doesn't exist
    expect(result).toBe(false);

    // Should log an error
    expect(require('@clack/prompts').log.error).toHaveBeenCalled();
  });
});
