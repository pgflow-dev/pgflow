import { EdgeWorker } from '../_src/EdgeWorker.ts';
import { sql, sleep } from '../utils.ts';

const sleep1s = async () => {
  console.time('Task time');
  const lastVal = await sql`SELECT nextval('test_seq')`;
  console.log('[serial_sleep] lastVal =', lastVal);
  await sleep(1000);
  console.timeEnd('Task time');
};

EdgeWorker.start(sleep1s, {
  queueName: 'serial_sleep',
  maxConcurrent: 1,
  visibilityTimeout: 5, // higher than the delay()
});
