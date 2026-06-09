import { EdgeWorker } from '@pgflow/edge-worker';
import { startPortableExample } from '../_shared/portable_examples.js';

const ENV_KEY = 'EDGE_WORKER_DB_URL';
const EXPECTED_URL = 'postgresql://postgres:postgres@db:5432/postgres';

const originalGet = Deno.env.get.bind(Deno.env);
Deno.env.get = function (key: string) {
  if (key === ENV_KEY) {
    return EXPECTED_URL;
  }

  return originalGet(key);
};

const originalToObject = Deno.env.toObject.bind(Deno.env);
Deno.env.toObject = function () {
  return {
    ...originalToObject(),
    [ENV_KEY]: EXPECTED_URL,
  };
};

startPortableExample(EdgeWorker, 'conn_env_var', {
  expectedConnectionString: EXPECTED_URL,
});
