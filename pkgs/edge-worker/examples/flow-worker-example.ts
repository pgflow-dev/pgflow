import { createFlowWorker } from '../src/createFlowWorker.ts';
import { Flow } from '../../dsl/src/dsl.ts';

// Define a simple flow
type Input = {
  userId: string;
};

const ExampleFlow = new Flow<Input>({
  slug: 'example_flow',
  maxAttempts: 3,
})
  .step(
    { slug: 'fetchUserData' },
    (payload) => {
      console.log(`Fetching data for user ${payload.run.userId}`);
      return {
        name: 'John Doe',
        email: 'john@example.com'
      };
    }
  )
  .step(
    { slug: 'processUserData', dependsOn: ['fetchUserData'] },
    (payload) => {
      console.log(`Processing data for ${payload.fetchUserData.name}`);
      return {
        processed: true,
        timestamp: new Date().toISOString()
      };
    }
  )
  .step(
    { slug: 'notifyUser', dependsOn: ['processUserData', 'fetchUserData'] },
    (payload) => {
      console.log(`Notifying user ${payload.fetchUserData.email} about processed data`);
      return {
        notified: true
      };
    }
  );

// Create a flow worker
const worker = createFlowWorker(ExampleFlow, {
  connectionString: Deno.env.get('EDGE_WORKER_DB_URL'),
  maxConcurrent: 5,
  batchSize: 10
});

// Start the worker
worker.startOnlyOnce({
  edgeFunctionName: 'flow-worker',
  workerId: 'flow-worker-1'
});

// Handle shutdown
Deno.addSignalListener('SIGINT', () => {
  console.log('Shutting down flow worker...');
  worker.stop();
});

// Keep the process running
await new Promise(() => {});
