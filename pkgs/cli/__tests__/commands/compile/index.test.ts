import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFlowSQL } from '../../../src/commands/compile';
import { Command } from 'commander';

// Mock modules before imports
vi.mock('fs');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import fs from 'fs';
import { log } from '@clack/prompts';
import compileCommand from '../../../src/commands/compile';

describe('fetchFlowSQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch flow SQL successfully', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: [
          "SELECT pgflow.create_flow('test_flow');",
          "SELECT pgflow.add_step('test_flow', 'step1');",
        ],
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchFlowSQL(
      'test_flow',
      'http://127.0.0.1:50621/functions/v1/pgflow',
      'test-publishable-key'
    );

    expect(result).toEqual({
      flowSlug: 'test_flow',
      sql: [
        "SELECT pgflow.create_flow('test_flow');",
        "SELECT pgflow.add_step('test_flow', 'step1');",
      ],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:50621/functions/v1/pgflow/flows/test_flow',
      {
        headers: {
          'Authorization': 'Bearer test-publishable-key',
          'apikey': 'test-publishable-key',
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should handle 404 with helpful error message', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Flow Not Found',
        message: "Flow 'unknown_flow' not found. Did you add it to flows.ts?",
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow("Flow 'unknown_flow' not found");
    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('Add your flow to supabase/functions/pgflow/flows.ts');
  });

  it('should handle ECONNREFUSED with startup instructions', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('Could not connect to ControlPlane');
    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('Start Supabase: supabase start');
    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('npx pgflow@0.8.0');
  });

  it('should handle generic HTTP errors', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('HTTP 500: Internal Server Error');
  });

  it('should handle fetch timeout errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('Could not connect to ControlPlane');
  });

  it('should validate response format', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: [
          "SELECT pgflow.create_flow('test_flow');",
          "SELECT pgflow.add_step('test_flow', 'step1');",
        ],
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchFlowSQL(
      'test_flow',
      'http://127.0.0.1:50621',
      'test-publishable-key'
    );

    expect(result).toHaveProperty('flowSlug');
    expect(result).toHaveProperty('sql');
    expect(Array.isArray(result.sql)).toBe(true);
    expect(result.sql.length).toBeGreaterThan(0);
  });

  it('should handle empty error messages in 404 response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Flow Not Found',
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow("Flow 'unknown_flow' not found");
    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:50621/functions/v1/pgflow', 'test-publishable-key')
    ).rejects.toThrow('Did you add it to flows.ts');
  });

  it('should construct correct URL with flow slug', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'my_complex_flow_123',
        sql: ["SELECT pgflow.create_flow('my_complex_flow_123');"],
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchFlowSQL(
      'my_complex_flow_123',
      'http://127.0.0.1:50621/functions/v1/pgflow',
      'test-publishable-key'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:50621/functions/v1/pgflow/flows/my_complex_flow_123',
      expect.any(Object)
    );
  });

  it('should pass publishable key in Authorization header', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: ["SELECT pgflow.create_flow('test_flow');"],
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchFlowSQL(
      'test_flow',
      'http://127.0.0.1:50621/functions/v1/pgflow',
      'my-special-publishable-key'
    );

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), {
      headers: {
        'Authorization': 'Bearer my-special-publishable-key',
        'apikey': 'my-special-publishable-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('should handle empty SQL array response', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'empty_flow',
        sql: [],
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    // Current behavior: returns empty array (documenting current behavior)
    const result = await fetchFlowSQL(
      'empty_flow',
      'http://127.0.0.1:50621/functions/v1/pgflow',
      'test-publishable-key'
    );

    expect(result.sql).toEqual([]);
  });
});

describe('compile command action', () => {
  let program: Command;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create a fresh program and register the compile command
    program = new Command();
    program.exitOverride();
    compileCommand(program);

    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Default fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should write migration file with correct filename format', async () => {
    // Mock successful fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: ["SELECT pgflow.create_flow('test_flow');"],
      }),
    });

    // Mock Date to return fixed time: 2024-06-15T14:30:45.000Z
    const fixedDate = new Date('2024-06-15T14:30:45.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    await program.parseAsync([
      'node',
      'test',
      'compile',
      'test_flow',
      '--supabase-path',
      '/tmp/supabase',
    ]);

    vi.useRealTimers();

    // Verify writeFileSync was called with correct filename pattern
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/20240615143045_create_test_flow_flow\.sql$/),
      expect.any(String)
    );
  });

  it('should create migrations directory if missing', async () => {
    // Supabase exists, but migrations dir doesn't
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes('migrations')) return false;
      return true; // supabase dir exists
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: ["SELECT pgflow.create_flow('test_flow');"],
      }),
    });

    await program.parseAsync([
      'node',
      'test',
      'compile',
      'test_flow',
      '--supabase-path',
      '/tmp/supabase',
    ]);

    // Verify mkdirSync was called with recursive option
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('migrations'),
      { recursive: true }
    );
  });

  it('should warn about existing migration and still create new one', async () => {
    // Return existing migration in directory
    vi.mocked(fs.readdirSync).mockReturnValue([
      '20240101120000_create_test_flow_flow.sql' as unknown as fs.Dirent,
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: ["SELECT pgflow.create_flow('test_flow');"],
      }),
    });

    await program.parseAsync([
      'node',
      'test',
      'compile',
      'test_flow',
      '--supabase-path',
      '/tmp/supabase',
    ]);

    // Verify warning was logged
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Found existing migration(s) for 'test_flow'")
    );

    // Verify new file was still created
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should exit with error when supabase path does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(
      program.parseAsync([
        'node',
        'test',
        'compile',
        'test_flow',
        '--supabase-path',
        '/nonexistent/supabase',
      ])
    ).rejects.toThrow('process.exit called');

    // Verify error was logged
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('Supabase directory not found')
    );

    // Verify process.exit was called with 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should generate timestamp in YYYYMMDDHHMMSS UTC format', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        flowSlug: 'test_flow',
        sql: ["SELECT pgflow.create_flow('test_flow');"],
      }),
    });

    // Set a specific time to verify UTC formatting
    // Local time could be different, but we expect UTC: 2024-12-25T09:05:03.000Z
    const fixedDate = new Date('2024-12-25T09:05:03.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    await program.parseAsync([
      'node',
      'test',
      'compile',
      'test_flow',
      '--supabase-path',
      '/tmp/supabase',
    ]);

    vi.useRealTimers();

    // Verify filename starts with correct UTC timestamp: 20241225090503
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/20241225090503_create_test_flow_flow\.sql$/),
      expect.any(String)
    );
  });
});
