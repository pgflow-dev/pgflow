import { EdgeWorker } from '@pgflow/edge-worker';
import TestFlow from './test_flow.ts';

EdgeWorker.start(TestFlow);
