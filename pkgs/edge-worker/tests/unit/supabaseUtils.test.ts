import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getAnonSupabaseClient, 
  getServiceSupabaseClient, 
  resetMemoizedClients 
} from '../../src/core/supabase-utils.js';

// Mock the @supabase/supabase-js module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string, options?: any) => ({
    _url: url,
    _key: key,
    _options: options,
    // Add a unique identifier to verify instance equality
    _instanceId: Math.random(),
  })),
}));

describe('supabase-utils', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockAnonKey = 'anon-key-123';
  const mockServiceKey = 'service-key-456';

  beforeEach(() => {
    // Reset memoized clients before each test
    resetMemoizedClients();
    // Clear mock calls
    vi.clearAllMocks();
  });

  describe('getAnonSupabaseClient', () => {
    it('should return undefined when SUPABASE_URL is missing', () => {
      const env = {
        SUPABASE_ANON_KEY: mockAnonKey,
      };

      const client = getAnonSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should return undefined when SUPABASE_ANON_KEY is missing', () => {
      const env = {
        SUPABASE_URL: mockUrl,
      };

      const client = getAnonSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should return undefined when both env vars are missing', () => {
      const env = {};

      const client = getAnonSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should create a client when both env vars exist', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
      };

      const client = getAnonSupabaseClient(env);
      expect(client).toBeDefined();
      expect(client?._url).toBe(mockUrl);
      expect(client?._key).toBe(mockAnonKey);
      expect(client?._options).toEqual({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    });

    it('should return the same instance on subsequent calls (memoization)', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
      };

      const client1 = getAnonSupabaseClient(env);
      const client2 = getAnonSupabaseClient(env);
      
      // Should be the exact same instance
      expect(client1).toBe(client2);
      expect(client1?._instanceId).toBe(client2?._instanceId);
    });

    it('should return memoized instance even with different env object', () => {
      const env1 = {
        SUPABASE_URL: mockUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
      };

      const env2 = {
        SUPABASE_URL: 'different-url',
        SUPABASE_ANON_KEY: 'different-key',
      };

      const client1 = getAnonSupabaseClient(env1);
      const client2 = getAnonSupabaseClient(env2);
      
      // Should still return the first memoized instance
      expect(client1).toBe(client2);
      expect(client2?._url).toBe(mockUrl); // Not 'different-url'
      expect(client2?._key).toBe(mockAnonKey); // Not 'different-key'
    });
  });

  describe('getServiceSupabaseClient', () => {
    it('should return undefined when SUPABASE_URL is missing', () => {
      const env = {
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      const client = getServiceSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should return undefined when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      const env = {
        SUPABASE_URL: mockUrl,
      };

      const client = getServiceSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should return undefined when both env vars are missing', () => {
      const env = {};

      const client = getServiceSupabaseClient(env);
      expect(client).toBeUndefined();
    });

    it('should create a client when both env vars exist', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      const client = getServiceSupabaseClient(env);
      expect(client).toBeDefined();
      expect(client?._url).toBe(mockUrl);
      expect(client?._key).toBe(mockServiceKey);
      expect(client?._options).toEqual({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    });

    it('should return the same instance on subsequent calls (memoization)', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      const client1 = getServiceSupabaseClient(env);
      const client2 = getServiceSupabaseClient(env);
      
      // Should be the exact same instance
      expect(client1).toBe(client2);
      expect(client1?._instanceId).toBe(client2?._instanceId);
    });

    it('should return memoized instance even with different env object', () => {
      const env1 = {
        SUPABASE_URL: mockUrl,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      const env2 = {
        SUPABASE_URL: 'different-url',
        SUPABASE_SERVICE_ROLE_KEY: 'different-key',
      };

      const client1 = getServiceSupabaseClient(env1);
      const client2 = getServiceSupabaseClient(env2);
      
      // Should still return the first memoized instance
      expect(client1).toBe(client2);
      expect(client2?._url).toBe(mockUrl); // Not 'different-url'
      expect(client2?._key).toBe(mockServiceKey); // Not 'different-key'
    });
  });

  describe('client isolation', () => {
    it('should maintain separate instances for anon and service clients', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      const anonClient = getAnonSupabaseClient(env);
      const serviceClient = getServiceSupabaseClient(env);

      // Should be different instances
      expect(anonClient).not.toBe(serviceClient);
      expect(anonClient?._instanceId).not.toBe(serviceClient?._instanceId);
      
      // But with correct keys
      expect(anonClient?._key).toBe(mockAnonKey);
      expect(serviceClient?._key).toBe(mockServiceKey);
    });
  });

  describe('resetMemoizedClients', () => {
    it('should clear memoized clients', () => {
      const env = {
        SUPABASE_URL: mockUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: mockServiceKey,
      };

      // Create clients
      const anonClient1 = getAnonSupabaseClient(env);
      const serviceClient1 = getServiceSupabaseClient(env);

      // Reset
      resetMemoizedClients();

      // Get new clients
      const anonClient2 = getAnonSupabaseClient(env);
      const serviceClient2 = getServiceSupabaseClient(env);

      // Should be different instances after reset
      expect(anonClient1).not.toBe(anonClient2);
      expect(serviceClient1).not.toBe(serviceClient2);
      expect(anonClient1?._instanceId).not.toBe(anonClient2?._instanceId);
      expect(serviceClient1?._instanceId).not.toBe(serviceClient2?._instanceId);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined values in env object', () => {
      const env = {
        SUPABASE_URL: undefined,
        SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      };

      const anonClient = getAnonSupabaseClient(env);
      const serviceClient = getServiceSupabaseClient(env);

      expect(anonClient).toBeUndefined();
      expect(serviceClient).toBeUndefined();
    });

    it('should handle empty string values as missing', () => {
      const env = {
        SUPABASE_URL: '',
        SUPABASE_ANON_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      };

      const anonClient = getAnonSupabaseClient(env);
      const serviceClient = getServiceSupabaseClient(env);

      expect(anonClient).toBeUndefined();
      expect(serviceClient).toBeUndefined();
    });
  });
});