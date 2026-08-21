import { EdgeWorker } from '@pgflow/edge-worker';
import { startPortableExample } from '../_shared/portable_examples.js';

startPortableExample(EdgeWorker, 'conn_max_pg_default');
