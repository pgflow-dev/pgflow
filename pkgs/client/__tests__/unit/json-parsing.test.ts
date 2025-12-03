import { describe, it, expect, vi } from 'vitest';
import { SupabaseBroadcastAdapter } from '../../src/lib/SupabaseBroadcastAdapter';
import type { BroadcastStepEvent, BroadcastRunEvent } from '../../src/lib/types';
import {
  setupTestEnvironment,
  createMockClient,
  emitBroadcastEvent,
  createSyncSchedule,
} from '../helpers/test-utils';
import { mockChannelSubscription } from '../mocks';

describe('JSON Parsing in Broadcasts', () => {
  setupTestEnvironment();
  let adapter: SupabaseBroadcastAdapter;
  let stepEventHandler: (event: BroadcastStepEvent) => void;
  let runEventHandler: (event: BroadcastRunEvent) => void;
  let mocks: any;

  beforeEach(async () => {
    const mockClient = createMockClient();
    mocks = mockClient.mocks;
    mockChannelSubscription(mocks);

    adapter = new SupabaseBroadcastAdapter(mockClient.client, { stabilizationDelayMs: 0, schedule: createSyncSchedule() });

    // Set up event handlers to capture parsed events
    stepEventHandler = vi.fn();
    runEventHandler = vi.fn();
    adapter.onStepEvent(stepEventHandler);
    adapter.onRunEvent(runEventHandler);

    // Subscribe to a run to configure the channel
    await adapter.subscribeToRun('test-run-id');
  });

  describe('Step Events', () => {
    it('should parse JSON string output from step:completed broadcast', async () => {
      const complexOutput = {
        result: 'success',
        data: { count: 42, items: ['a', 'b', 'c'] },
        metadata: { timestamp: '2024-01-01T00:00:00Z' },
      };

      // Simulate broadcast with JSON string output (as sent by realtime.send)
      const broadcastPayload = {
        event: 'step:simple_step:completed',
        payload: {
          event_type: 'step:completed',
          run_id: 'test-run-id',
          step_slug: 'simple_step',
          status: 'completed',
          output: JSON.stringify(complexOutput), // Realtime sends this as string
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Trigger the broadcast callback (simulating Supabase realtime)
      emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);


      // Verify the handler received parsed object, not string
      expect(stepEventHandler).toHaveBeenCalledWith({
        event_type: 'step:completed',
        run_id: 'test-run-id',
        step_slug: 'simple_step',
        status: 'completed',
        output: complexOutput, // Should be parsed object
        completed_at: '2024-01-01T00:00:00Z',
      });
    });

    it('should handle non-JSON output gracefully', async () => {
      // Simulate broadcast with non-JSON string output
      const broadcastPayload = {
        event: 'step:simple_step:completed',
        payload: {
          event_type: 'step:completed',
          run_id: 'test-run-id',
          step_slug: 'simple_step',
          status: 'completed',
          output: 'plain text output', // Not JSON
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Trigger the broadcast callback (simulating Supabase realtime)
      emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);

      // Verify the handler received the original string (no parsing error)
      expect(stepEventHandler).toHaveBeenCalledWith({
        event_type: 'step:completed',
        run_id: 'test-run-id',
        step_slug: 'simple_step',
        status: 'completed',
        output: 'plain text output', // Should remain as string
        completed_at: '2024-01-01T00:00:00Z',
      });
    });

    it('should handle already parsed output objects', async () => {
      const objectOutput = { already: 'parsed' };

      // Simulate broadcast with already parsed object (edge case)
      const broadcastPayload = {
        event: 'step:simple_step:completed',
        payload: {
          event_type: 'step:completed',
          run_id: 'test-run-id',
          step_slug: 'simple_step',
          status: 'completed',
          output: objectOutput, // Already an object
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Trigger the broadcast callback (simulating Supabase realtime)
      emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);

      // Verify the handler received the object unchanged
      expect(stepEventHandler).toHaveBeenCalledWith({
        event_type: 'step:completed',
        run_id: 'test-run-id',
        step_slug: 'simple_step',
        status: 'completed',
        output: objectOutput, // Should remain as object
        completed_at: '2024-01-01T00:00:00Z',
      });
    });
  });

  describe('Run Events', () => {
    it('should parse JSON string input from run:started broadcast', async () => {
      const complexInput = {
        url: 'https://example.com',
        options: { timeout: 30000, retries: 3 },
        metadata: { user_id: 123 },
      };

      // Simulate broadcast with JSON string input
      const broadcastPayload = {
        event: 'run:started',
        payload: {
          run_id: 'test-run-id',
          flow_slug: 'test_flow',
          input: JSON.stringify(complexInput), // Realtime sends this as string
          status: 'started',
          started_at: '2024-01-01T00:00:00Z',
          remaining_steps: 3,
        },
      };

      // Trigger the broadcast callback (simulating Supabase realtime)
      emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);


      // Verify the handler received parsed object, not string
      expect(runEventHandler).toHaveBeenCalledWith({
        run_id: 'test-run-id',
        flow_slug: 'test_flow',
        input: complexInput, // Should be parsed object
        status: 'started',
        started_at: '2024-01-01T00:00:00Z',
        remaining_steps: 3,
      });
    });

    it('should parse JSON string output from run:completed broadcast', async () => {
      const complexOutput = {
        final_result: 'success',
        steps_completed: 5,
        summary: { total_time: '10.5s', errors: 0 },
      };

      // Simulate broadcast with JSON string output
      const broadcastPayload = {
        event: 'run:completed',
        payload: {
          run_id: 'test-run-id',
          output: JSON.stringify(complexOutput), // Realtime sends this as string
          status: 'completed',
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Trigger the broadcast callback (simulating Supabase realtime)
      emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);


      // Verify the handler received parsed object, not string
      expect(runEventHandler).toHaveBeenCalledWith({
        run_id: 'test-run-id',
        output: complexOutput, // Should be parsed object
        status: 'completed',
        completed_at: '2024-01-01T00:00:00Z',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed JSON gracefully', async () => {
      const broadcastPayload = {
        event: 'step:simple_step:completed',
        payload: {
          event_type: 'step:completed',
          run_id: 'test-run-id',
          step_slug: 'simple_step',
          status: 'completed',
          output: '{"malformed": json}', // Invalid JSON
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Should not throw error
      expect(() => {
        emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);
      }).not.toThrow();

      // Should keep original string when JSON parsing fails
      expect(stepEventHandler).toHaveBeenCalledWith({
        event_type: 'step:completed',
        run_id: 'test-run-id',
        step_slug: 'simple_step',
        status: 'completed',
        output: '{"malformed": json}', // Should remain as original string
        completed_at: '2024-01-01T00:00:00Z',
      });
    });

    it('should handle empty string JSON fields', async () => {
      const broadcastPayload = {
        event: 'step:simple_step:completed',
        payload: {
          event_type: 'step:completed',
          run_id: 'test-run-id',
          step_slug: 'simple_step',
          status: 'completed',
          output: '', // Empty string
          completed_at: '2024-01-01T00:00:00Z',
        },
      };

      // Should not throw error
      expect(() => {
        emitBroadcastEvent(mocks, broadcastPayload.event, broadcastPayload.payload);
      }).not.toThrow();

      // Should keep empty string when JSON parsing fails
      expect(stepEventHandler).toHaveBeenCalledWith({
        event_type: 'step:completed',
        run_id: 'test-run-id',
        step_slug: 'simple_step',
        status: 'completed',
        output: '', // Should remain as empty string
        completed_at: '2024-01-01T00:00:00Z',
      });
    });
  });
});
