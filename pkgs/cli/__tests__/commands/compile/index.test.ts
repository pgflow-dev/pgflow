import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFlowSQL } from '../../../src/commands/compile';

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
});
