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
