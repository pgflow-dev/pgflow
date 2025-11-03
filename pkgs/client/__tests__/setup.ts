/**
 * Vitest setup file - runs before all tests
 *
 * Registers custom matchers and performs any global test configuration
 */
import { registerEventMatchers } from './helpers/event-matchers';

// Register custom event matchers with Vitest
registerEventMatchers();
