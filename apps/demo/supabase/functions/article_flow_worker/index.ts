import { EdgeWorker } from '@pgflow/edge-worker';
import ArticleFlow from './article_flow.ts';

EdgeWorker.start(ArticleFlow);
