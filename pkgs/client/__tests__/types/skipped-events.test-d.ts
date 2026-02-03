import { describe, it, expectTypeOf } from 'vitest';
import { FlowStepStatus } from '../../src/lib/types';
import type {
  SkipReason,
  StepEventData,
  BroadcastStepSkippedEvent,
  FlowStepState,
} from '../../src/lib/types';
import { Flow, type ExtractFlowSteps } from '@pgflow/dsl';

// Create a sample flow for testing
const TestFlow = new Flow<{ data: string }>({
  slug: 'test_flow',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  .step({ slug: 'step_a' }, (input) => ({
    result: input.data.toUpperCase(),
  }))
  .step({ slug: 'step_b', dependsOn: ['step_a'] }, (input) => ({
    processed: input.step_a.result,
  }));

describe('Skipped Event Type Tests', () => {
  describe('SkipReason type', () => {
    it('should be a union of valid skip reasons', () => {
      // SkipReason should be a union of these three values
      expectTypeOf<SkipReason>().toEqualTypeOf<
        'condition_unmet' | 'handler_failed' | 'dependency_skipped'
      >();
    });

    it('should be assignable from valid skip reasons', () => {
      const conditionUnmet: SkipReason = 'condition_unmet';
      const handlerFailed: SkipReason = 'handler_failed';
      const dependencySkipped: SkipReason = 'dependency_skipped';

      expectTypeOf(conditionUnmet).toMatchTypeOf<SkipReason>();
      expectTypeOf(handlerFailed).toMatchTypeOf<SkipReason>();
      expectTypeOf(dependencySkipped).toMatchTypeOf<SkipReason>();
    });
  });

  describe('BroadcastStepSkippedEvent type', () => {
    it('should have required skipped event properties', () => {
      expectTypeOf<BroadcastStepSkippedEvent>().toMatchTypeOf<{
        event_type: 'step:skipped';
        run_id: string;
        step_slug: string;
        status: FlowStepStatus.Skipped;
        skipped_at: string;
        skip_reason: SkipReason;
      }>();
    });

    it('should have status as FlowStepStatus.Skipped literal', () => {
      expectTypeOf<
        BroadcastStepSkippedEvent['status']
      >().toEqualTypeOf<FlowStepStatus.Skipped>();
    });

    it('should have event_type as step:skipped literal', () => {
      expectTypeOf<
        BroadcastStepSkippedEvent['event_type']
      >().toEqualTypeOf<'step:skipped'>();
    });
  });

  describe('StepEventData with skipped event', () => {
    type StepSlugs = keyof ExtractFlowSteps<typeof TestFlow> & string;
    type TestStepEventData = StepEventData<typeof TestFlow, StepSlugs>;

    it('should include skipped event type in StepEventData', () => {
      // StepEventData should have a 'skipped' key
      expectTypeOf<TestStepEventData>().toHaveProperty('skipped');
    });

    it('should have correct skipped event structure', () => {
      type SkippedEvent = TestStepEventData['skipped'];

      expectTypeOf<SkippedEvent>().toMatchTypeOf<{
        event_type: 'step:skipped';
        run_id: string;
        step_slug: string;
        status: FlowStepStatus.Skipped;
        skipped_at: string;
        skip_reason: SkipReason;
      }>();
    });

    it('should type step_slug as the flow step slug type', () => {
      type SkippedEvent = TestStepEventData['skipped'];
      // step_slug should be typed as the specific step slugs, not just string
      expectTypeOf<SkippedEvent['step_slug']>().toMatchTypeOf<StepSlugs>();
    });
  });

  describe('FlowStepState with skipped fields', () => {
    type StepSlugs = keyof ExtractFlowSteps<typeof TestFlow> & string;
    type TestStepState = FlowStepState<typeof TestFlow, StepSlugs>;

    it('should have skipped_at field as Date | null', () => {
      expectTypeOf<TestStepState>().toHaveProperty('skipped_at');
      expectTypeOf<TestStepState['skipped_at']>().toEqualTypeOf<Date | null>();
    });

    it('should have skip_reason field as SkipReason | null', () => {
      expectTypeOf<TestStepState>().toHaveProperty('skip_reason');
      expectTypeOf<
        TestStepState['skip_reason']
      >().toEqualTypeOf<SkipReason | null>();
    });
  });

  describe('FlowStepStatus enum', () => {
    it('should include Skipped status', () => {
      // Verify that FlowStepStatus has a Skipped value
      expectTypeOf(FlowStepStatus.Skipped).toMatchTypeOf<FlowStepStatus>();
    });

    it('should have Skipped equal to string skipped', () => {
      // Verify the enum value is the expected string
      const skipped: 'skipped' = FlowStepStatus.Skipped;
      expectTypeOf<typeof skipped>().toEqualTypeOf<'skipped'>();
    });
  });
});
