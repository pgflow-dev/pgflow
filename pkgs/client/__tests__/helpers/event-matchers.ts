import { expect } from 'vitest';
import type { EventTracker } from './test-utils';

/**
 * Custom Vitest matchers for event assertions
 *
 * These matchers provide clean, standard Vitest-style assertions for event testing.
 * They separate concerns: trackers collect data, matchers make assertions.
 *
 * Usage:
 *   expect(tracker).toHaveReceivedEvent('run:started', { run_id: RUN_ID });
 *   expect(tracker).toHaveReceivedEventSequence(['run:started', 'run:completed']);
 *   expect(tracker).not.toHaveReceivedEvent('run:failed');
 */

interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

export const eventMatchers = {
  /**
   * Assert that tracker received a specific event type, optionally with matching payload
   */
  toHaveReceivedEvent<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    eventType: string,
    payload?: Partial<T>
  ): MatcherResult {
    const events = tracker.findByType(eventType);
    const event = events[0];

    if (!event) {
      return {
        pass: false,
        message: () => {
          const summary = tracker.getSummary();
          return [
            `Expected to receive event "${eventType}" but did not`,
            '',
            'Received events:',
            ...Object.entries(summary.breakdown).map(
              ([type, count]) => `  - ${type}: ${count}x`
            ),
          ].join('\n');
        },
      };
    }

    if (payload) {
      // Check if payload matches
      const mismatches: string[] = [];
      for (const [key, expectedValue] of Object.entries(payload)) {
        const actualValue = event[key as keyof T];
        if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
          mismatches.push(
            `  - ${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
          );
        }
      }

      if (mismatches.length > 0) {
        return {
          pass: false,
          message: () =>
            [
              `Event "${eventType}" payload does not match expected:`,
              '',
              ...mismatches,
              '',
              'Full event:',
              JSON.stringify(event, null, 2),
            ].join('\n'),
        };
      }
    }

    return {
      pass: true,
      message: () => `Expected not to receive event "${eventType}"${payload ? ' with matching payload' : ''}`,
    };
  },

  /**
   * Assert exact event sequence (no gaps, exact order)
   */
  toHaveReceivedEventSequence<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    expectedTypes: string[]
  ): MatcherResult {
    const actual = tracker.getSequence();
    const pass = JSON.stringify(actual) === JSON.stringify(expectedTypes);

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to receive sequence:\n  [${expectedTypes.join(', ')}]`
          : [
              'Expected event sequence:',
              `  [${expectedTypes.join(', ')}]`,
              '',
              'But received:',
              `  [${actual.join(', ')}]`,
              '',
              'Diff:',
              ...expectedTypes.map((expected, i) => {
                const actualType = actual[i];
                if (actualType === expected) {
                  return `  ✓ [${i}] ${expected}`;
                } else {
                  return `  ✗ [${i}] expected "${expected}", got "${actualType || 'nothing'}"`;
                }
              }),
            ].join('\n'),
    };
  },

  /**
   * Assert subsequence exists (order matters, but gaps allowed)
   */
  toHaveReceivedEventSubsequence<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    expectedTypes: string[]
  ): MatcherResult {
    const sequence = tracker.getSequence();
    let matchIndex = 0;
    const matchedIndices: number[] = [];

    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i] === expectedTypes[matchIndex]) {
        matchedIndices.push(i);
        matchIndex++;
        if (matchIndex === expectedTypes.length) break;
      }
    }

    const pass = matchIndex === expectedTypes.length;

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to receive subsequence:\n  [${expectedTypes.join(', ')}]`
          : [
              'Expected event subsequence:',
              `  [${expectedTypes.join(', ')}]`,
              '',
              'In sequence:',
              `  [${sequence.join(', ')}]`,
              '',
              `Matched ${matchIndex} of ${expectedTypes.length} events`,
              matchIndex > 0 ? `Matched at indices: [${matchedIndices.join(', ')}]` : '',
            ]
              .filter(Boolean)
              .join('\n'),
    };
  },

  /**
   * Assert minimum count of events by type
   */
  toHaveReceivedAtLeast<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    eventType: string,
    minCount: number
  ): MatcherResult {
    const count = tracker.countByType(eventType);
    const pass = count >= minCount;

    return {
      pass,
      message: () =>
        pass
          ? `Expected fewer than ${minCount} "${eventType}" events, but got ${count}`
          : `Expected at least ${minCount} "${eventType}" events, but got ${count}`,
      actual: count,
      expected: minCount,
    };
  },

  /**
   * Assert exact count of events by type
   */
  toHaveReceivedEventCount<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    eventType: string,
    expectedCount: number
  ): MatcherResult {
    const count = tracker.countByType(eventType);
    const pass = count === expectedCount;

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to receive exactly ${expectedCount} "${eventType}" events`
          : `Expected ${expectedCount} "${eventType}" events, but got ${count}`,
      actual: count,
      expected: expectedCount,
    };
  },

  /**
   * Assert relative ordering of two event types
   */
  toHaveReceivedInOrder<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    earlierType: string,
    laterType: string
  ): MatcherResult {
    const sequence = tracker.getSequence();
    const earlierIndex = sequence.indexOf(earlierType);
    const laterIndex = sequence.indexOf(laterType);

    if (earlierIndex === -1) {
      return {
        pass: false,
        message: () =>
          `Expected to find "${earlierType}" event but it was not received\n\nSequence: [${sequence.join(', ')}]`,
      };
    }

    if (laterIndex === -1) {
      return {
        pass: false,
        message: () =>
          `Expected to find "${laterType}" event but it was not received\n\nSequence: [${sequence.join(', ')}]`,
      };
    }

    const pass = earlierIndex < laterIndex;

    return {
      pass,
      message: () =>
        pass
          ? `Expected "${earlierType}" not to come before "${laterType}"`
          : [
              `Expected "${earlierType}" to come before "${laterType}"`,
              '',
              'Sequence:',
              `  [${sequence.join(', ')}]`,
              '',
              `"${earlierType}" at index ${earlierIndex}`,
              `"${laterType}" at index ${laterIndex}`,
            ].join('\n'),
    };
  },

  /**
   * Assert no events of a specific type were received
   */
  toNotHaveReceivedEvent<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    eventType: string
  ): MatcherResult {
    const count = tracker.countByType(eventType);
    const pass = count === 0;

    return {
      pass,
      message: () =>
        pass
          ? `Expected to receive "${eventType}" event but it was not received`
          : `Expected not to receive "${eventType}" event, but received ${count} time(s)`,
      actual: count,
      expected: 0,
    };
  },

  /**
   * Assert total number of events received
   */
  toHaveReceivedTotalEvents<T extends { event_type: string }>(
    tracker: EventTracker<T>,
    expectedTotal: number
  ): MatcherResult {
    const actual = tracker.events.length;
    const pass = actual === expectedTotal;

    return {
      pass,
      message: () => {
        const summary = tracker.getSummary();
        return pass
          ? `Expected not to receive exactly ${expectedTotal} total events`
          : [
              `Expected ${expectedTotal} total events, but got ${actual}`,
              '',
              'Breakdown:',
              ...Object.entries(summary.breakdown).map(
                ([type, count]) => `  - ${type}: ${count}x`
              ),
            ].join('\n');
      },
      actual,
      expected: expectedTotal,
    };
  },
};

// Extend Vitest's expect type
declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveReceivedEvent(eventType: string, payload?: Partial<any>): T;
    toHaveReceivedEventSequence(types: string[]): T;
    toHaveReceivedEventSubsequence(types: string[]): T;
    toHaveReceivedAtLeast(eventType: string, minCount: number): T;
    toHaveReceivedEventCount(eventType: string, expectedCount: number): T;
    toHaveReceivedInOrder(earlierType: string, laterType: string): T;
    toNotHaveReceivedEvent(eventType: string): T;
    toHaveReceivedTotalEvents(expectedTotal: number): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveReceivedEvent(eventType: string, payload?: Partial<any>): any;
    toHaveReceivedEventSequence(types: string[]): any;
    toHaveReceivedEventSubsequence(types: string[]): any;
    toHaveReceivedAtLeast(eventType: string, minCount: number): any;
    toHaveReceivedEventCount(eventType: string, expectedCount: number): any;
    toHaveReceivedInOrder(earlierType: string, laterType: string): any;
    toNotHaveReceivedEvent(eventType: string): any;
    toHaveReceivedTotalEvents(expectedTotal: number): any;
  }
}

// Register matchers with Vitest
export function registerEventMatchers() {
  expect.extend(eventMatchers);
}
