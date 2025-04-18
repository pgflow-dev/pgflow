import { assertEquals, assertSpyCalls, spy } from '@std/testing/mock';
import { EdgeWorker } from '../../src/EdgeWorker.ts';
import { AnyFlow } from '@pgflow/dsl';

// Create a mock Flow instance
const mockFlow = {
  name: 'TestFlow',
  steps: [],
} as unknown as AnyFlow;

// Create a mock message handler function
const mockHandler = async (message: unknown) => {
  return;
};

Deno.test('EdgeWorker.start() dispatches to startQueueWorker for function handlers', async () => {
  // Spy on the startQueueWorker method
  const startQueueWorkerSpy = spy(EdgeWorker, 'startQueueWorker');
  
  try {
    // Reset the wasCalled flag for testing
    // @ts-ignore - accessing private property for testing
    EdgeWorker.wasCalled = false;
    
    // Call start with a function handler
    await EdgeWorker.start(mockHandler, { maxConcurrent: 5 });
    
    // Verify startQueueWorker was called with the correct arguments
    assertSpyCalls(startQueueWorkerSpy, 1);
    assertEquals(startQueueWorkerSpy.calls[0].args[0], mockHandler);
    assertEquals(startQueueWorkerSpy.calls[0].args[1].maxConcurrent, 5);
  } finally {
    // Clean up the spy
    startQueueWorkerSpy.restore();
  }
});

Deno.test('EdgeWorker.start() dispatches to startFlowWorker for Flow instances', async () => {
  // Spy on the startFlowWorker method
  const startFlowWorkerSpy = spy(EdgeWorker, 'startFlowWorker');
  
  try {
    // Reset the wasCalled flag for testing
    // @ts-ignore - accessing private property for testing
    EdgeWorker.wasCalled = false;
    
    // Call start with a Flow instance
    await EdgeWorker.start(mockFlow, { maxConcurrent: 10 });
    
    // Verify startFlowWorker was called with the correct arguments
    assertSpyCalls(startFlowWorkerSpy, 1);
    assertEquals(startFlowWorkerSpy.calls[0].args[0], mockFlow);
    assertEquals(startFlowWorkerSpy.calls[0].args[1].maxConcurrent, 10);
  } finally {
    // Clean up the spy
    startFlowWorkerSpy.restore();
  }
});
