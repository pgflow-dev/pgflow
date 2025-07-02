import { EdgeWorker } from 'jsr:@pgflow/edge-worker@0.5.0';

let attemptCount = 0;
let lastAttemptTime: number | null = null;

EdgeWorker.start(
  async (payload: any) => {
    attemptCount++;
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    
    // Calculate time since last attempt
    let timeSinceLastAttempt = '';
    if (lastAttemptTime) {
      const seconds = (now - lastAttemptTime) / 1000;
      timeSinceLastAttempt = ` (${seconds.toFixed(1)}s since last attempt)`;
    }
    
    console.log(`[${timestamp}] Attempt #${attemptCount}${timeSinceLastAttempt}`);
    console.log(`  Processing message:`, payload);
    
    lastAttemptTime = now;
    
    // Fail first 3 attempts to demonstrate retry
    if (attemptCount < 4) {
      console.log(`  FAILING - Will retry with exponential backoff`);
      throw new Error('Intentional failure to test retry');
    }
    
    console.log(`  SUCCESS after ${attemptCount} attempts!`);
    
    // Reset for next message
    attemptCount = 0;
    lastAttemptTime = null;
    
    return { processed: true, attempts: 4 };
  },
  {
    queueName: 'retry-demo',
    retry: {
      strategy: 'exponential',
      limit: 5,
      baseDelay: 2, // Start with 2 seconds
      maxDelay: 20  // Cap at 20 seconds
    }
  }
);