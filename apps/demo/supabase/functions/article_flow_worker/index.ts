import { EdgeWorker } from '@pgflow/edge-worker';
import { ArticleFlow } from '../../flows/article_flow.ts';

EdgeWorker.start(ArticleFlow, { maxPollSeconds: 5, pollIntervalMs: 100 });
