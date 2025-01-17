import { EdgeWorker } from '../_supaworker/index.ts';

function failingAlways() {
  console.log('(╯°□°)╯︵ ┻━┻');
  throw new Error('(╯°□°)╯︵ ┻━┻');
}

EdgeWorker.start(failingAlways, {
  queueName: 'failing_always',
  retryLimit: 2,
  retryDelay: 2,
  maxPollSeconds: 1,
});
