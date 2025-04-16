import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fs, vol } from 'memfs';

// Tell Vitest to use memfs' mock for node:fs
vi.mock('node:fs');
// If you use fs/promises elsewhere, also:
// vi.mock('node:fs/promises')

// Mock clack prompts to avoid actual prompts/logging/pollution
vi.mock('@clack/prompts', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
  note: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true), // Default to true for tests
}));

// Import *AFTER* mocks
import { copyMigrations } from '../../../src/commands/install/copy-migrations.js';

// Setup variables to match your implementation's expected layouts
const MIGRATION_FILE_CONTENT = 'CREATE TABLE test (id INT);';
const ANOTHER_MIGRATION = 'CREATE TABLE another (foo TEXT);';

const setupFs = (opts: { hasExistingDest?: boolean } = {}) => {
  // This path logic must match your copy-migrations.ts logic for `sourcePath`
  // __dirname here will be something like '/some/path/pkgs/cli/src/commands/install'
  // sourcePath is '../../migrations' from that point
  // For memfs, just choose any root -- e.g. '/base'
  const sourcePath = '/base/pkgs/cli/migrations';
  const testSupabase = '/tmp/supabase';
  const files = {
    // Source migration files
    [`${sourcePath}/01_first.sql`]: MIGRATION_FILE_CONTENT,
    [`${sourcePath}/02_second.sql`]: ANOTHER_MIGRATION,
    // (Optionally) Existing migration in dest
    ...(opts.hasExistingDest
      ? { [`${testSupabase}/migrations/01_first.sql`]: MIGRATION_FILE_CONTENT }
      : {}),
  };
  vol.fromJSON(files, '/'); // Set up from root
  // Also ensure config.toml exists if that ever gets checked
  vol.mkdirSync(`${testSupabase}`, { recursive: true });
  vol.writeFileSync(`${testSupabase}/config.toml`, '');

  return { sourcePath, testSupabase };
};

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe('copyMigrations (memfs integration)', () => {
  it('copies all migrations if there are none in destination', async () => {
    const { testSupabase } = setupFs();

    // Call copyMigrations with autoConfirm
    const result = await copyMigrations({
      supabasePath: testSupabase,
      autoConfirm: true,
    });
    expect(result).toBe(true);

    // Both migration files should now exist in dest
    expect(
      fs.readFileSync(`${testSupabase}/migrations/01_first.sql`, 'utf8')
    ).toBe(MIGRATION_FILE_CONTENT);
    expect(
      fs.readFileSync(`${testSupabase}/migrations/02_second.sql`, 'utf8')
    ).toBe(ANOTHER_MIGRATION);
  });

  it('skips files already in dest but copies new ones', async () => {
    const { testSupabase } = setupFs({ hasExistingDest: true });

    const result = await copyMigrations({
      supabasePath: testSupabase,
      autoConfirm: true,
    });
    expect(result).toBe(true);

    // The existing file should stay
    expect(
      fs.readFileSync(`${testSupabase}/migrations/01_first.sql`, 'utf8')
    ).toBe(MIGRATION_FILE_CONTENT);
    // The new one should be copied
    expect(
      fs.readFileSync(`${testSupabase}/migrations/02_second.sql`, 'utf8')
    ).toBe(ANOTHER_MIGRATION);
  });

  it('throws an error if no files to copy', async () => {
    const { testSupabase } = setupFs({ hasExistingDest: true });
    // Also create the second migration in dest
    fs.mkdirSync(`${testSupabase}/migrations`, { recursive: true });
    fs.writeFileSync(
      `${testSupabase}/migrations/02_second.sql`,
      ANOTHER_MIGRATION
    );

    await expect(
      copyMigrations({
        supabasePath: testSupabase,
        autoConfirm: true,
      })
    ).rejects.toThrow('No new migrations to copy');
  });

  it('throws MigrationCancelledError if user cancels', async () => {
    const { testSupabase } = setupFs();

    // Mock confirm to return false for this test
    const confirmMock = vi.fn().mockResolvedValue(false);
    const promptsMock = require('@clack/prompts');
    promptsMock.confirm = confirmMock;

    await expect(
      copyMigrations({
        supabasePath: testSupabase,
        autoConfirm: false, // Force prompt
      })
    ).rejects.toThrow(MigrationCancelledError);
  });
});
