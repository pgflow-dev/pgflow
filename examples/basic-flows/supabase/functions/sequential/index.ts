import { EdgeWorker } from '@pgflow/edge-worker';
import SequentialFlow from './flow.ts';

EdgeWorker.start(SequentialFlow);
