import { Supaworker } from '../_supaworker/index.ts';

function failingAlways() {
  console.log('(╯°□°)╯︵ ┻━┻');
  throw new Error('(╯°□°)╯︵ ┻━┻');
}

Supaworker.start(failingAlways, {
  queueName: 'failing_always',
  retryLimit: 2,
  retryDelay: 2,
  maxPollSeconds: 1,
});
