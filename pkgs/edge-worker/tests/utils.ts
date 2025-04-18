import { setTimeout } from 'node:timers/promises';

/**
 * Simple promise-based delay
 */
export function sleep(ms: number): Promise<void> {
  return setTimeout(ms);
}
