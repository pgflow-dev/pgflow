import { describe, test, expect } from 'vitest';
import { createEventTracker } from '../helpers/test-utils';
import type { BroadcastRunEvent, BroadcastStepEvent } from '../../src/lib/types';

/**
 * Tests demonstrating the new event matcher patterns
 *
 * This file serves as both tests and documentation for how to use
 * the custom event matchers for comprehensive event testing.
 */
describe('Event Matchers (Examples)', () => {
  describe('toHaveReceivedEvent', () => {
    test('asserts event type was received', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: { foo: 'bar' },
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      // Assert event was received
      expect(tracker).toHaveReceivedEvent('run:started');
    });

    test('asserts event with matching payload', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();
      const testInput = { foo: 'bar' };

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: testInput,
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      // Assert event with specific payload fields
      expect(tracker).toHaveReceivedEvent('run:started', {
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: testInput,
      });
    });

    test('can be negated', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: {},
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      // Assert event was NOT received using standard Vitest negation
      expect(tracker).not.toHaveReceivedEvent('run:failed');
    });
  });

  describe('toHaveReceivedEventSequence', () => {
    test('asserts exact event sequence', () => {
      const tracker = createEventTracker<BroadcastStepEvent>();

      // Emit events in sequence
      tracker.callback({
        event_type: 'step:started',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'started',
        started_at: new Date().toISOString(),
      });

      tracker.callback({
        event_type: 'step:completed',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'completed',
        output: { result: 'success' },
        completed_at: new Date().toISOString(),
      });

      // Assert exact sequence
      expect(tracker).toHaveReceivedEventSequence(['step:started', 'step:completed']);
    });

    test('fails if sequence is wrong', () => {
      const tracker = createEventTracker<BroadcastStepEvent>();

      tracker.callback({
        event_type: 'step:completed',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'completed',
        output: {},
        completed_at: new Date().toISOString(),
      });

      tracker.callback({
        event_type: 'step:started',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'started',
        started_at: new Date().toISOString(),
      });

      // This will fail because order is wrong
      expect(() => {
        expect(tracker).toHaveReceivedEventSequence(['step:started', 'step:completed']);
      }).toThrow();
    });
  });

  describe('toHaveReceivedEventSubsequence', () => {
    test('allows gaps in sequence', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: {},
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 2,
      });

      // Some intermediate events...
      tracker.callback({
        event_type: 'run:progress' as any,
        run_id: 'test-run',
        remaining_steps: 1,
      } as any);

      tracker.callback({
        event_type: 'run:completed',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        status: 'completed',
        output: {},
        completed_at: new Date().toISOString(),
        remaining_steps: 0,
      });

      // Assert subsequence (gaps allowed)
      expect(tracker).toHaveReceivedEventSubsequence(['run:started', 'run:completed']);
    });
  });

  describe('toHaveReceivedAtLeast', () => {
    test('asserts minimum event count', () => {
      const tracker = createEventTracker<BroadcastStepEvent>();

      // Emit multiple step events
      for (let i = 0; i < 3; i++) {
        tracker.callback({
          event_type: 'step:completed',
          run_id: 'test-run',
          step_slug: `step${i}`,
          status: 'completed',
          output: {},
          completed_at: new Date().toISOString(),
        });
      }

      // Assert at least 3 events
      expect(tracker).toHaveReceivedAtLeast('step:completed', 3);
      // Also works with lower numbers
      expect(tracker).toHaveReceivedAtLeast('step:completed', 1);
    });
  });

  describe('toHaveReceivedEventCount', () => {
    test('asserts exact event count', () => {
      const tracker = createEventTracker<BroadcastStepEvent>();

      tracker.callback({
        event_type: 'step:started',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'started',
        started_at: new Date().toISOString(),
      });

      tracker.callback({
        event_type: 'step:started',
        run_id: 'test-run',
        step_slug: 'step2',
        status: 'started',
        started_at: new Date().toISOString(),
      });

      // Assert exactly 2 events
      expect(tracker).toHaveReceivedEventCount('step:started', 2);
    });
  });

  describe('toHaveReceivedInOrder', () => {
    test('asserts relative ordering', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: {},
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      tracker.callback({
        event_type: 'run:completed',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        status: 'completed',
        output: {},
        completed_at: new Date().toISOString(),
        remaining_steps: 0,
      });

      // Assert started comes before completed
      expect(tracker).toHaveReceivedInOrder('run:started', 'run:completed');
    });
  });

  describe('toNotHaveReceivedEvent', () => {
    test('asserts event was not received', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: {},
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      // Assert failed event was not received
      expect(tracker).toNotHaveReceivedEvent('run:failed');
    });
  });

  describe('toHaveReceivedTotalEvents', () => {
    test('asserts total event count', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();

      tracker.callback({
        event_type: 'run:started',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        input: {},
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      tracker.callback({
        event_type: 'run:completed',
        run_id: 'test-run',
        flow_slug: 'test-flow',
        status: 'completed',
        output: {},
        completed_at: new Date().toISOString(),
        remaining_steps: 0,
      });

      // Assert exactly 2 total events
      expect(tracker).toHaveReceivedTotalEvents(2);
    });
  });

  describe('Real-world pattern: Complete flow lifecycle', () => {
    test('validates complete event sequence with payloads', () => {
      const tracker = createEventTracker<BroadcastRunEvent>();
      const runId = 'test-run-123';
      const flowSlug = 'my-flow';
      const input = { user_id: '456' };
      const output = { result: 'success' };

      // Simulate run lifecycle
      tracker.callback({
        event_type: 'run:started',
        run_id: runId,
        flow_slug: flowSlug,
        input,
        status: 'started',
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      });

      tracker.callback({
        event_type: 'run:completed',
        run_id: runId,
        flow_slug: flowSlug,
        status: 'completed',
        output,
        completed_at: new Date().toISOString(),
        remaining_steps: 0,
      });

      // Comprehensive assertions
      expect(tracker).toHaveReceivedTotalEvents(2);
      expect(tracker).toHaveReceivedEventSequence(['run:started', 'run:completed']);
      expect(tracker).toHaveReceivedEvent('run:started', { run_id: runId, input });
      expect(tracker).toHaveReceivedEvent('run:completed', { run_id: runId, output });
      expect(tracker).toNotHaveReceivedEvent('run:failed');
      expect(tracker).toHaveReceivedInOrder('run:started', 'run:completed');
    });
  });

  describe('Combining with tracker query methods', () => {
    test('can mix matchers with manual queries for complex assertions', () => {
      const tracker = createEventTracker<BroadcastStepEvent>();

      // Emit multiple events
      tracker.callback({
        event_type: 'step:started',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'started',
        started_at: new Date().toISOString(),
      });

      tracker.callback({
        event_type: 'step:completed',
        run_id: 'test-run',
        step_slug: 'step1',
        status: 'completed',
        output: { items: 5 },
        completed_at: new Date().toISOString(),
      });

      // Use matchers for standard assertions
      expect(tracker).toHaveReceivedEventSequence(['step:started', 'step:completed']);

      // Use query methods for complex logic
      const completedEvents = tracker.findByType('step:completed');
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].output).toEqual({ items: 5 });

      // Can also use query methods in custom assertions
      const firstEvent = tracker.getFirstByType('step:started');
      expect(firstEvent?.step_slug).toBe('step1');
    });
  });
});
