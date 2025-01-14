import { Supaworker } from '../_supaworker/index.ts';

function failingAlways() {
  console.log('table flip');
  throw new Error('table flip');
  // console.log('(╯°□°)╯︵ ┻━┻');
  // throw new Error('(╯°□°)╯︵ ┻━┻');
}

Supaworker.start(failingAlways, {
  retryLimit: 5,
  retryDelay: 2000,
});
