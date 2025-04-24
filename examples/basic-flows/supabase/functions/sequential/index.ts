import { EdgeWorker } from '@pgflow/edge-worker';
import SequentialFlow from './sequential.ts';

EdgeWorker.start(SequentialFlow);
