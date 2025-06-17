import { describe, it, expect, vi } from 'vitest';
import { createClient, PgflowClient } from '../src/browser';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('browser entry point', () => {
  it('should export createClient factory function', () => {
    expect(createClient).toBeDefined();
    expect(typeof createClient).toBe('function');
  });

  it('should create PgflowClient instance using createClient', () => {
    // Mock Supabase client
    const mockSupabase = {
      channel: vi.fn(),
      schema: vi.fn(() => ({
        from: vi.fn(),
        rpc: vi.fn()
      }))
    } as unknown as SupabaseClient;

    const client = createClient(mockSupabase);
    
    expect(client).toBeInstanceOf(PgflowClient);
  });

  it('should also export PgflowClient class directly', () => {
    // This ensures backward compatibility for npm users
    expect(PgflowClient).toBeDefined();
    expect(typeof PgflowClient).toBe('function');
  });
});