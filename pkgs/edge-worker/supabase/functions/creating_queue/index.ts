import { EdgeWorker } from '../_src/EdgeWorker.ts';

EdgeWorker.start(console.log, {
  queueName: 'creating_queue',
});
