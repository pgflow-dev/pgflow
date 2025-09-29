import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { getSupabaseConfig, fetchFlowSQL } from '../../../src/commands/compile';

describe('getSupabaseConfig', () => {
  let mockProcess: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create fresh mock child process for each test
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    // Create mock spawn function that returns our mock process
    mockSpawn = vi.fn().mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  it('should parse valid supabase status JSON', async () => {
    const validStatus = JSON.stringify({
      API_URL: 'http://127.0.0.1:54321',
      ANON_KEY: 'test-anon-key',
      SERVICE_ROLE_KEY: 'test-service-key',
    });

    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    // Simulate successful command execution
    mockProcess.stdout.emit('data', Buffer.from(validStatus));
    mockProcess.emit('close', 0);

    const result = await promise;

    expect(result).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      anonKey: 'test-anon-key',
    });

    // Verify spawn was called correctly
    expect(mockSpawn).toHaveBeenCalledWith('supabase', ['status', '--output=json'], {
      cwd: '/test/supabase',
    });
  });

  it('should error when API_URL is missing', async () => {
    const invalidStatus = JSON.stringify({
      ANON_KEY: 'test-anon-key',
    });

    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.stdout.emit('data', Buffer.from(invalidStatus));
    mockProcess.emit('close', 0);

    await expect(promise).rejects.toThrow('Could not find API_URL');
    await expect(promise).rejects.toThrow('Make sure Supabase is running');
  });

  it('should error when ANON_KEY is missing', async () => {
    const invalidStatus = JSON.stringify({
      API_URL: 'http://127.0.0.1:54321',
    });

    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.stdout.emit('data', Buffer.from(invalidStatus));
    mockProcess.emit('close', 0);

    await expect(promise).rejects.toThrow('Could not find ANON_KEY');
    await expect(promise).rejects.toThrow('Make sure Supabase is running');
  });

  it('should handle JSON parse errors', async () => {
    const invalidJson = 'not valid json{{{';

    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.stdout.emit('data', Buffer.from(invalidJson));
    mockProcess.emit('close', 0);

    await expect(promise).rejects.toThrow('Failed to parse supabase status JSON');
  });

  it('should handle supabase command failure', async () => {
    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.stderr.emit('data', Buffer.from('Error: Supabase not running'));
    mockProcess.emit('close', 1);

    await expect(promise).rejects.toThrow('Failed to get Supabase status');
    await expect(promise).rejects.toThrow('exit code 1');
  });

  it('should handle spawn errors', async () => {
    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.emit('error', new Error('Command not found'));

    await expect(promise).rejects.toThrow('Failed to run supabase status');
    await expect(promise).rejects.toThrow('Command not found');
    await expect(promise).rejects.toThrow('Make sure Supabase CLI is installed');
  });

  it('should handle multi-chunk stdout data', async () => {
    const chunk1 = '{"API_URL": "http://127';
    const chunk2 = '.0.0.1:54321", "ANON_KEY": ';
    const chunk3 = '"test-anon-key"}';

    const promise = getSupabaseConfig('/test/supabase', mockSpawn);

    mockProcess.stdout.emit('data', Buffer.from(chunk1));
    mockProcess.stdout.emit('data', Buffer.from(chunk2));
    mockProcess.stdout.emit('data', Buffer.from(chunk3));
    mockProcess.emit('close', 0);

    const result = await promise;

    expect(result).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      anonKey: 'test-anon-key',
    });
  });
});

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
      'http://127.0.0.1:54321',
      'test-anon-key'
    );

    expect(result).toEqual({
      flowSlug: 'test_flow',
      sql: [
        "SELECT pgflow.create_flow('test_flow');",
        "SELECT pgflow.add_step('test_flow', 'step1');",
      ],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/functions/v1/pgflow/flows/test_flow',
      {
        headers: {
          Authorization: 'Bearer test-anon-key',
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
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow("Flow 'unknown_flow' not found");
    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow('Add your flow to supabase/functions/pgflow/flows.ts');
  });

  it('should handle ECONNREFUSED with startup instructions', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow('Could not connect to ControlPlane');
    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow('Start Supabase: supabase start');
    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:54321', 'test-anon-key')
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
      fetchFlowSQL('test_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow('HTTP 500: Internal Server Error');
  });

  it('should handle fetch timeout errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    await expect(
      fetchFlowSQL('test_flow', 'http://127.0.0.1:54321', 'test-anon-key')
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
      'http://127.0.0.1:54321',
      'test-anon-key'
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
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:54321', 'test-anon-key')
    ).rejects.toThrow("Flow 'unknown_flow' not found");
    await expect(
      fetchFlowSQL('unknown_flow', 'http://127.0.0.1:54321', 'test-anon-key')
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
      'http://127.0.0.1:54321',
      'test-anon-key'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/functions/v1/pgflow/flows/my_complex_flow_123',
      expect.any(Object)
    );
  });

  it('should pass anon key in Authorization header', async () => {
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
      'http://127.0.0.1:54321',
      'my-special-anon-key'
    );

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), {
      headers: {
        Authorization: 'Bearer my-special-anon-key',
        'Content-Type': 'application/json',
      },
    });
  });
});
