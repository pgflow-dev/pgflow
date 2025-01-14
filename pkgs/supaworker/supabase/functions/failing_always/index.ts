import { Supaworker } from '../_supaworker/index.ts';

async function failingAlways() {
  throw new Error('(╯°□°)╯︵ ┻━┻');
}

Supaworker.start(failingAlways, {
  retryLimit: 5,
});
