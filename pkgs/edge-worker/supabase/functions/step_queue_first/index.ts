import { EdgeWorker } from '@pgflow/edge-worker';
import { stepQueueE2EFlow } from '../_shared/step_queue_flow.ts';

EdgeWorker.start(stepQueueE2EFlow, { stepSlug: 'first' });
