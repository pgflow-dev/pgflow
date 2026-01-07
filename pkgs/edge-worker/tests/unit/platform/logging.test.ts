import { assertEquals } from '@std/assert';
import { assertSpyCalls, spy, restore } from '@std/testing/mock';
import { createLoggingFactory } from '../../../src/platform/logging.ts';

// ============================================================
// Log Level Tests
// ============================================================

Deno.test('createLoggingFactory - verbose level exists between info and debug', () => {
  const factory = createLoggingFactory();
  const logger = factory.createLogger('test');

  // verbose() method should exist
  assertEquals(typeof logger.verbose, 'function');
});

Deno.test('createLoggingFactory - verbose messages logged when level is verbose', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory();
    factory.setLogLevel('verbose');
    const logger = factory.createLogger('test');

    logger.verbose('test message');

    assertSpyCalls(consoleSpy, 1);
  } finally {
    restore();
  }
});

Deno.test('createLoggingFactory - verbose messages NOT logged when level is info', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory();
    factory.setLogLevel('info');
    const logger = factory.createLogger('test');

    logger.verbose('test message');

    assertSpyCalls(consoleSpy, 0);
  } finally {
    restore();
  }
});

Deno.test('createLoggingFactory - debug messages logged when level is debug', () => {
  const consoleSpy = spy(console, 'debug');

  try {
    const factory = createLoggingFactory();
    factory.setLogLevel('debug');
    const logger = factory.createLogger('test');

    logger.debug('test message');

    assertSpyCalls(consoleSpy, 1);
  } finally {
    restore();
  }
});

Deno.test('createLoggingFactory - debug messages NOT logged when level is verbose', () => {
  const consoleSpy = spy(console, 'debug');

  try {
    const factory = createLoggingFactory();
    factory.setLogLevel('verbose');
    const logger = factory.createLogger('test');

    logger.debug('test message');

    assertSpyCalls(consoleSpy, 0);
  } finally {
    restore();
  }
});

Deno.test('createLoggingFactory - verbose messages logged when level is debug', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory();
    factory.setLogLevel('debug');
    const logger = factory.createLogger('test');

    logger.verbose('test message');

    assertSpyCalls(consoleSpy, 1);
  } finally {
    restore();
  }
});

// ============================================================
// Log Level Hierarchy Tests
// ============================================================

Deno.test('createLoggingFactory - level hierarchy: error < warn < info < verbose < debug', () => {
  // Test that each level only logs its level and above
  const factory = createLoggingFactory();
  const logger = factory.createLogger('test');

  // At error level, only error should log
  factory.setLogLevel('error');
  const errorSpy = spy(console, 'error');
  const warnSpy = spy(console, 'warn');
  const infoSpy = spy(console, 'info');
  const logSpy = spy(console, 'log');
  const debugSpy = spy(console, 'debug');

  try {
    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.verbose('v');
    logger.debug('d');

    assertSpyCalls(errorSpy, 1);
    assertSpyCalls(warnSpy, 0);
    assertSpyCalls(infoSpy, 0);
    assertSpyCalls(logSpy, 0); // verbose uses console.log
    assertSpyCalls(debugSpy, 0);
  } finally {
    restore();
  }
});

// ============================================================
// Environment Configuration Tests (Phase 2)
// ============================================================

Deno.test('createLoggingFactory - colorsEnabled defaults to true', () => {
  const factory = createLoggingFactory();

  assertEquals(factory.colorsEnabled, true);
});

Deno.test('createLoggingFactory - colorsEnabled is false when NO_COLOR env var is set', () => {
  const factory = createLoggingFactory({ NO_COLOR: '1' });

  assertEquals(factory.colorsEnabled, false);
});

Deno.test('createLoggingFactory - colorsEnabled is false when NO_COLOR is any truthy value', () => {
  // NO_COLOR standard: presence of the variable (any value) disables colors
  const factory1 = createLoggingFactory({ NO_COLOR: 'true' });
  assertEquals(factory1.colorsEnabled, false);

  const factory2 = createLoggingFactory({ NO_COLOR: '' });
  // Empty string is still "set" per NO_COLOR standard
  assertEquals(factory2.colorsEnabled, false);
});

Deno.test('createLoggingFactory - format defaults to simple when env not provided', () => {
  const factory = createLoggingFactory();

  assertEquals(factory.format, 'simple');
});

Deno.test('createLoggingFactory - format is fancy for local Supabase environment', () => {
  const localEnv = {
    SUPABASE_URL: 'http://kong:8000',
  };
  const factory = createLoggingFactory(localEnv);

  assertEquals(factory.format, 'fancy');
});

Deno.test('createLoggingFactory - format is simple for hosted Supabase environment', () => {
  const hostedEnv = {
    SUPABASE_URL: 'https://abc123.supabase.co',
  };
  const factory = createLoggingFactory(hostedEnv);

  assertEquals(factory.format, 'simple');
});

Deno.test('createLoggingFactory - EDGE_WORKER_LOG_FORMAT overrides auto-detection', () => {
  // Even in local env, explicit format override should win
  const localEnv = {
    SUPABASE_URL: 'http://kong:8000',
    EDGE_WORKER_LOG_FORMAT: 'simple',
  };
  const factory = createLoggingFactory(localEnv);

  assertEquals(factory.format, 'simple');
});

Deno.test('createLoggingFactory - EDGE_WORKER_LOG_FORMAT can set fancy in hosted env', () => {
  const hostedEnv = {
    SUPABASE_URL: 'https://abc123.supabase.co',
    EDGE_WORKER_LOG_FORMAT: 'fancy',
  };
  const factory = createLoggingFactory(hostedEnv);

  assertEquals(factory.format, 'fancy');
});

Deno.test('createLoggingFactory - default log level is verbose for local env', () => {
  const localEnv = {
    SUPABASE_URL: 'http://kong:8000',
  };
  const factory = createLoggingFactory(localEnv);

  assertEquals(factory.logLevel, 'verbose');
});

Deno.test('createLoggingFactory - default log level is info for hosted env', () => {
  const hostedEnv = {
    SUPABASE_URL: 'https://abc123.supabase.co',
  };
  const factory = createLoggingFactory(hostedEnv);

  assertEquals(factory.logLevel, 'info');
});

Deno.test('createLoggingFactory - EDGE_WORKER_LOG_LEVEL overrides default', () => {
  const localEnv = {
    SUPABASE_URL: 'http://kong:8000',
    EDGE_WORKER_LOG_LEVEL: 'debug',
  };
  const factory = createLoggingFactory(localEnv);

  assertEquals(factory.logLevel, 'debug');
});
