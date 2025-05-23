import { describe, it, expect } from 'vitest';
import {
  isFlowRunEvent,
  isStepEvent,
  isStepStartedEvent,
  isStepCompletedEvent,
  isStepFailedEvent,
  FlowRunStatus,
  FlowStepStatus,
} from '../../src/lib/types';
import {
  broadcastRunStarted,
  broadcastRunCompleted,
  broadcastRunFailed,
  broadcastStepStarted,
  broadcastStepCompleted,
  broadcastStepFailed,
  RUN_ID,
  STEP_SLUG,
} from '../fixtures';

describe('Type Guards', () => {
  describe('isFlowRunEvent', () => {
    it('correctly identifies run:started events', () => {
      expect(isFlowRunEvent(broadcastRunStarted)).toBe(true);
    });

    it('correctly identifies run:completed events', () => {
      expect(isFlowRunEvent(broadcastRunCompleted)).toBe(true);
    });

    it('correctly identifies run:failed events', () => {
      expect(isFlowRunEvent(broadcastRunFailed)).toBe(true);
    });

    it('rejects step events', () => {
      expect(isFlowRunEvent(broadcastStepStarted)).toBe(false);
      expect(isFlowRunEvent(broadcastStepCompleted)).toBe(false);
      expect(isFlowRunEvent(broadcastStepFailed)).toBe(false);
    });

    it('rejects malformed events', () => {
      expect(isFlowRunEvent(null)).toBe(false);
      expect(isFlowRunEvent(undefined)).toBe(false);
      expect(isFlowRunEvent({})).toBe(false);
      expect(isFlowRunEvent({ event_type: 'invalid' })).toBe(false);
      expect(isFlowRunEvent({ event_type: 'run:invalid' })).toBe(false);
    });

    it('rejects events with missing required fields', () => {
      expect(isFlowRunEvent({
        event_type: 'run:started',
        // missing run_id
        flow_slug: 'test-flow',
        status: FlowRunStatus.Started,
      })).toBe(false);

      expect(isFlowRunEvent({
        event_type: 'run:started',
        run_id: RUN_ID,
        // missing flow_slug
        status: FlowRunStatus.Started,
      })).toBe(false);

      expect(isFlowRunEvent({
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: 'test-flow',
        // missing status
      })).toBe(false);
    });

    it('handles edge cases with extra properties', () => {
      const eventWithExtra = {
        ...broadcastRunStarted,
        extra_property: 'should not affect validation',
        another_field: 123,
      };
      expect(isFlowRunEvent(eventWithExtra)).toBe(true);
    });

    it('validates status field correctly', () => {
      expect(isFlowRunEvent({
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: 'test-flow',
        status: 'invalid-status',
      })).toBe(false);

      expect(isFlowRunEvent({
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: 'test-flow',
        status: null,
      })).toBe(false);
    });
  });

  describe('isStepEvent', () => {
    it('correctly identifies step:started events', () => {
      expect(isStepEvent(broadcastStepStarted)).toBe(true);
    });

    it('correctly identifies step:completed events', () => {
      expect(isStepEvent(broadcastStepCompleted)).toBe(true);
    });

    it('correctly identifies step:failed events', () => {
      expect(isStepEvent(broadcastStepFailed)).toBe(true);
    });

    it('rejects run events', () => {
      expect(isStepEvent(broadcastRunStarted)).toBe(false);
      expect(isStepEvent(broadcastRunCompleted)).toBe(false);
      expect(isStepEvent(broadcastRunFailed)).toBe(false);
    });

    it('rejects malformed events', () => {
      expect(isStepEvent(null)).toBe(false);
      expect(isStepEvent(undefined)).toBe(false);
      expect(isStepEvent({})).toBe(false);
      expect(isStepEvent({ event_type: 'invalid' })).toBe(false);
      expect(isStepEvent({ event_type: 'step:invalid' })).toBe(false);
    });

    it('rejects events with missing required fields', () => {
      expect(isStepEvent({
        event_type: 'step:started',
        // missing run_id
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Started,
      })).toBe(false);

      expect(isStepEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        // missing step_slug
        status: FlowStepStatus.Started,
      })).toBe(false);

      expect(isStepEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        // missing status
      })).toBe(false);
    });

    it('validates status field correctly', () => {
      expect(isStepEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: 'invalid-status',
      })).toBe(false);

      expect(isStepEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: null,
      })).toBe(false);
    });
  });

  describe('isStepStartedEvent', () => {
    it('correctly identifies step:started events', () => {
      expect(isStepStartedEvent(broadcastStepStarted)).toBe(true);
    });

    it('rejects other step events', () => {
      expect(isStepStartedEvent(broadcastStepCompleted)).toBe(false);
      expect(isStepStartedEvent(broadcastStepFailed)).toBe(false);
    });

    it('rejects run events', () => {
      expect(isStepStartedEvent(broadcastRunStarted)).toBe(false);
    });

    it('rejects malformed events', () => {
      expect(isStepStartedEvent(null)).toBe(false);
      expect(isStepStartedEvent({})).toBe(false);
      expect(isStepStartedEvent({
        event_type: 'step:completed', // wrong event type
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Started,
      })).toBe(false);
    });

    it('validates required fields for started events', () => {
      expect(isStepStartedEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Started,
        started_at: new Date().toISOString(),
        remaining_tasks: 1,
        remaining_deps: 0,
      })).toBe(true);

      // Missing started_at should still pass (optional field)
      expect(isStepStartedEvent({
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Started,
        remaining_tasks: 1,
        remaining_deps: 0,
      })).toBe(true);
    });
  });

  describe('isStepCompletedEvent', () => {
    it('correctly identifies step:completed events', () => {
      expect(isStepCompletedEvent(broadcastStepCompleted)).toBe(true);
    });

    it('rejects other step events', () => {
      expect(isStepCompletedEvent(broadcastStepStarted)).toBe(false);
      expect(isStepCompletedEvent(broadcastStepFailed)).toBe(false);
    });

    it('rejects run events', () => {
      expect(isStepCompletedEvent(broadcastRunCompleted)).toBe(false);
    });

    it('validates completed-specific fields', () => {
      expect(isStepCompletedEvent({
        event_type: 'step:completed',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Completed,
        completed_at: new Date().toISOString(),
        output: { result: 'success' },
      })).toBe(true);

      // Should work without output (optional)
      expect(isStepCompletedEvent({
        event_type: 'step:completed',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Completed,
        completed_at: new Date().toISOString(),
      })).toBe(true);
    });
  });

  describe('isStepFailedEvent', () => {
    it('correctly identifies step:failed events', () => {
      expect(isStepFailedEvent(broadcastStepFailed)).toBe(true);
    });

    it('rejects other step events', () => {
      expect(isStepFailedEvent(broadcastStepStarted)).toBe(false);
      expect(isStepFailedEvent(broadcastStepCompleted)).toBe(false);
    });

    it('rejects run events', () => {
      expect(isStepFailedEvent(broadcastRunFailed)).toBe(false);
    });

    it('validates failed-specific fields', () => {
      expect(isStepFailedEvent({
        event_type: 'step:failed',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Failed,
        failed_at: new Date().toISOString(),
        error_message: 'Step failed',
      })).toBe(true);

      // Should work without error_message (optional)
      expect(isStepFailedEvent({
        event_type: 'step:failed',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Failed,
        failed_at: new Date().toISOString(),
      })).toBe(true);
    });
  });

  describe('Type guard robustness', () => {
    it('handles deeply nested malformed objects', () => {
      const malformedEvent = {
        event_type: {
          nested: 'run:started',
        },
        run_id: {
          id: RUN_ID,
        },
      };

      expect(isFlowRunEvent(malformedEvent)).toBe(false);
      expect(isStepEvent(malformedEvent)).toBe(false);
    });

    it('handles circular references gracefully', () => {
      const circular: any = {
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: 'test-flow',
        status: FlowRunStatus.Started,
      };
      circular.self = circular;

      // Should not throw and should return reasonable result
      expect(() => isFlowRunEvent(circular)).not.toThrow();
    });

    it('handles very large objects efficiently', () => {
      const largeEvent = {
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: 'test-flow',
        status: FlowRunStatus.Started,
        // Add many extra properties
        ...Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`prop${i}`, `value${i}`])
        ),
      };

      expect(isFlowRunEvent(largeEvent)).toBe(true);
    });

    it('handles arrays passed as events', () => {
      expect(isFlowRunEvent([])).toBe(false);
      expect(isStepEvent([broadcastStepStarted])).toBe(false);
    });

    it('handles functions passed as events', () => {
      const eventFunction = () => broadcastRunStarted;
      expect(isFlowRunEvent(eventFunction)).toBe(false);
      expect(isStepEvent(eventFunction)).toBe(false);
    });

    it('handles primitive values', () => {
      expect(isFlowRunEvent('run:started')).toBe(false);
      expect(isFlowRunEvent(123)).toBe(false);
      expect(isFlowRunEvent(true)).toBe(false);
      expect(isStepEvent('step:started')).toBe(false);
      expect(isStepEvent(456)).toBe(false);
      expect(isStepEvent(false)).toBe(false);
    });
  });

  describe('Type inference validation', () => {
    it('provides correct type narrowing for flow run events', () => {
      const unknownEvent: unknown = broadcastRunStarted;
      
      if (isFlowRunEvent(unknownEvent)) {
        // TypeScript should know this is a FlowRunEvent
        expect(unknownEvent.event_type).toMatch(/^run:/);
        expect(unknownEvent.run_id).toBe(RUN_ID);
        expect(unknownEvent.flow_slug).toBeDefined();
        expect(unknownEvent.status).toBeDefined();
      }
    });

    it('provides correct type narrowing for step events', () => {
      const unknownEvent: unknown = broadcastStepStarted;
      
      if (isStepEvent(unknownEvent)) {
        // TypeScript should know this is a StepEvent
        expect(unknownEvent.event_type).toMatch(/^step:/);
        expect(unknownEvent.run_id).toBe(RUN_ID);
        expect(unknownEvent.step_slug).toBeDefined();
        expect(unknownEvent.status).toBeDefined();
      }
    });

    it('provides correct type narrowing for specific step events', () => {
      const unknownEvent: unknown = broadcastStepCompleted;
      
      if (isStepCompletedEvent(unknownEvent)) {
        // TypeScript should know this is specifically a StepCompletedEvent
        expect(unknownEvent.event_type).toBe('step:completed');
        expect(unknownEvent.status).toBe(FlowStepStatus.Completed);
        // completed_at should be available
        expect(unknownEvent.completed_at).toBeDefined();
      }
    });
  });
});