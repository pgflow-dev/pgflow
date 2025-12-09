import { assertEquals, assertStringIncludes } from '@std/assert';
import { assertSpyCalls, spy, restore } from '@std/testing/mock';
import { createLoggingFactory } from '../../../src/platform/logging.ts';

// ============================================================
// Type Definitions for Testing
// ============================================================

// These should match the types in types.ts
interface TaskLogContext {
  flowSlug: string;
  stepSlug: string;
  msgId: string;
  runId: string;
  workerId: string;
  workerName: string;
  queueName: string;
  retryAttempt?: number;
  maxRetries?: number;
}

interface StartupContext {
  workerName: string;
  workerId: string;
  queueName: string;
  flows: Array<{
    flowSlug: string;
    compilationStatus: 'compiled' | 'verified' | 'recompiled' | 'mismatch';
  }>;
}

// ============================================================
// Fancy Formatter Tests
// ============================================================

Deno.test('FancyFormatter - taskCompleted outputs correct format with worker prefix and flow/step path', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const call = consoleSpy.calls[0];
    const output = call.args[0] as string;

    // Should contain worker name prefix in blue (Phase 3b: worker-prefixed lines)
    assertStringIncludes(output, 'greet-user-worker:');
    // Should contain checkmark icon
    assertStringIncludes(output, '✓');
    // Should contain flow/step path format (Phase 3b: flowSlug/stepSlug)
    assertStringIncludes(output, 'greetUser/fetchProfile');
    // Should contain duration
    assertStringIncludes(output, '234ms');
    // At verbose level, should NOT contain identifiers (Phase 3b: clean verbose)
    assertEquals(output.includes('msg_id='), false);
    assertEquals(output.includes('run_id='), false);
    assertEquals(output.includes('worker_id='), false);
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskCompleted shows colors when colorsEnabled', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain ANSI color codes
    assertStringIncludes(output, '\x1b[');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskFailed outputs error with worker prefix and flow/step path', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'sendEmail',
      msgId: '1044',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    const error = new Error('Request failed');
    logger.taskFailed(ctx, error);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker name prefix (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    // Should contain X icon
    assertStringIncludes(output, '✗');
    // Should contain flow/step path format (Phase 3b)
    assertStringIncludes(output, 'greetUser/sendEmail');
    // Should contain error message
    assertStringIncludes(output, 'Request failed');
    // At verbose level, should NOT contain identifiers (Phase 3b: clean verbose)
    assertEquals(output.includes('msg_id='), false);
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskStarted outputs dim styling with identifiers (debug level)', () => {
  const consoleSpy = spy(console, 'debug');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      EDGE_WORKER_LOG_LEVEL: 'debug',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskStarted(ctx);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker name prefix (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    // Should contain right arrow icon (dim)
    assertStringIncludes(output, '›');
    // Should contain flow/step path format (Phase 3b)
    assertStringIncludes(output, 'greetUser/fetchProfile');
    // At debug level, SHOULD contain identifiers (Phase 3b: detailed debug)
    assertStringIncludes(output, 'run_id=run-123');
    assertStringIncludes(output, 'msg_id=1042');
    assertStringIncludes(output, 'worker_id=worker-1');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskStarted NOT logged when level is verbose', () => {
  const consoleSpy = spy(console, 'debug');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      EDGE_WORKER_LOG_LEVEL: 'verbose',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskStarted(ctx);

    // Should not log at verbose level
    assertSpyCalls(consoleSpy, 0);
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - retry information displayed when retryAttempt > 1', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'sendEmail',
      msgId: '1044',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
      retryAttempt: 2,
      maxRetries: 3,
    };

    logger.taskCompleted(ctx, 1203);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain retry info
    assertStringIncludes(output, 'retry');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - polling outputs with worker prefix', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    factory.setWorkerName('greet-user-worker');
    const logger = factory.createLogger('test');

    // Phase 3b: polling() no args needed (queue in banner)
    logger.polling();

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker name prefix (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    assertStringIncludes(output, 'Polling');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskCount shows count with worker prefix when > 0', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    factory.setWorkerName('greet-user-worker');
    const logger = factory.createLogger('test');

    // Phase 3b: taskCount(count: number) - simplified
    logger.taskCount(3);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker name prefix (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    assertStringIncludes(output, 'Starting');
    assertStringIncludes(output, '3');
    assertStringIncludes(output, 'tasks');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskCount muted with worker prefix when count is 0', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    factory.setWorkerName('greet-user-worker');
    const logger = factory.createLogger('test');

    // Phase 3b: taskCount(count: number) - simplified
    logger.taskCount(0);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker name prefix (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    assertStringIncludes(output, 'No tasks');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - startupBanner shows multi-flow with aligned list', () => {
  const consoleSpy = spy(console, 'info');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    const logger = factory.createLogger('test');

    // Phase 3b: StartupContext with multiple flows
    const ctx: StartupContext = {
      workerName: 'greet-user-worker',
      workerId: 'abc123',
      queueName: 'orders',
      flows: [
        { flowSlug: 'greetUser', compilationStatus: 'compiled' },
        { flowSlug: 'orderFlow', compilationStatus: 'verified' },
      ],
    };

    logger.startupBanner(ctx);

    // startupBanner should log multiple lines
    const callCount = consoleSpy.calls.length;
    assertEquals(callCount > 0, true);

    // Check that output contains expected info (Phase 3b format)
    const allOutput = consoleSpy.calls.map(c => c.args[0] as string).join('\n');
    // Worker name with worker_id
    assertStringIncludes(allOutput, 'greet-user-worker');
    assertStringIncludes(allOutput, 'abc123');
    // Queue name
    assertStringIncludes(allOutput, 'orders');
    // Both flows
    assertStringIncludes(allOutput, 'greetUser');
    assertStringIncludes(allOutput, 'orderFlow');
    // Compilation statuses
    assertStringIncludes(allOutput, 'compiled');
    assertStringIncludes(allOutput, 'verified');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - shutdown shows correct phase with worker prefix', () => {
  const consoleSpy = spy(console, 'info');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    });
    factory.setWorkerName('greet-user-worker');
    const logger = factory.createLogger('test');

    logger.shutdown('deprecating');

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should contain worker prefix and deprecation info (Phase 3b)
    assertStringIncludes(output, 'greet-user-worker:');
    assertStringIncludes(output, 'deprecation');
  } finally {
    restore();
  }
});

// ============================================================
// Simple Formatter Tests
// ============================================================

Deno.test('SimpleFormatter - taskCompleted outputs key=value format with worker/queue/flow/step', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'some-production-key',
      EDGE_WORKER_LOG_LEVEL: 'verbose',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Phase 3b: worker=X queue=Y flow=Z step=W format
    assertStringIncludes(output, 'worker=greet-user-worker');
    assertStringIncludes(output, 'queue=orders');
    assertStringIncludes(output, 'flow=greetUser');
    assertStringIncludes(output, 'step=fetchProfile');
    assertStringIncludes(output, 'status=completed');
    assertStringIncludes(output, 'duration_ms=234');
    assertStringIncludes(output, 'run_id=run-123');
    assertStringIncludes(output, 'msg_id=1042');
    assertStringIncludes(output, 'worker_id=worker-1');
  } finally {
    restore();
  }
});

Deno.test('SimpleFormatter - taskFailed outputs structured error with worker/queue/flow/step', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'some-production-key',
      EDGE_WORKER_LOG_LEVEL: 'verbose',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'sendEmail',
      msgId: '1044',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    const error = new Error('Request failed');
    logger.taskFailed(ctx, error);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Phase 3b: worker=X queue=Y flow=Z step=W format
    assertStringIncludes(output, 'worker=greet-user-worker');
    assertStringIncludes(output, 'queue=orders');
    assertStringIncludes(output, 'flow=greetUser');
    assertStringIncludes(output, 'step=sendEmail');
    assertStringIncludes(output, 'status=failed');
    assertStringIncludes(output, 'error=');
    assertStringIncludes(output, 'Request failed');
  } finally {
    restore();
  }
});

Deno.test('SimpleFormatter - no ANSI colors in output', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'some-production-key',
      EDGE_WORKER_LOG_LEVEL: 'verbose',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should NOT contain ANSI codes
    assertEquals(output.includes('\x1b['), false);
  } finally {
    restore();
  }
});

// ============================================================
// NO_COLOR Tests
// ============================================================

Deno.test('NO_COLOR disables colors in fancy mode', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      NO_COLOR: '1',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Should still be fancy format but without colors
    assertStringIncludes(output, '✓');
    assertStringIncludes(output, 'greetUser/fetchProfile');
    // Should NOT contain ANSI codes
    assertEquals(output.includes('\x1b['), false);
  } finally {
    restore();
  }
});

// ============================================================
// Debug Level Identifier Tests (Phase 3b)
// ============================================================

Deno.test('FancyFormatter - taskCompleted at DEBUG level includes identifiers', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      EDGE_WORKER_LOG_LEVEL: 'debug',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'fetchProfile',
      msgId: '1042',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    logger.taskCompleted(ctx, 234);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Phase 3b: At debug level, SHOULD include identifiers
    assertStringIncludes(output, 'run_id=run-123');
    assertStringIncludes(output, 'msg_id=1042');
    assertStringIncludes(output, 'worker_id=worker-1');
  } finally {
    restore();
  }
});

Deno.test('FancyFormatter - taskFailed at DEBUG level includes identifiers', () => {
  const consoleSpy = spy(console, 'log');

  try {
    const factory = createLoggingFactory({
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      EDGE_WORKER_LOG_LEVEL: 'debug',
    });
    const logger = factory.createLogger('test');

    const ctx: TaskLogContext = {
      flowSlug: 'greetUser',
      stepSlug: 'sendEmail',
      msgId: '1044',
      runId: 'run-123',
      workerId: 'worker-1',
      workerName: 'greet-user-worker',
      queueName: 'orders',
    };

    const error = new Error('Request failed');
    logger.taskFailed(ctx, error);

    assertSpyCalls(consoleSpy, 1);
    const output = consoleSpy.calls[0].args[0] as string;

    // Phase 3b: At debug level, SHOULD include identifiers
    assertStringIncludes(output, 'run_id=run-123');
    assertStringIncludes(output, 'msg_id=1044');
    assertStringIncludes(output, 'worker_id=worker-1');
  } finally {
    restore();
  }
});
