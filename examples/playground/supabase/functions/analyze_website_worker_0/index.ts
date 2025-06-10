import { EdgeWorker } from '@pgflow/edge-worker';
import AnalyzeWebsite from '../_flows/analyze_website.ts';

EdgeWorker.start(AnalyzeWebsite, { maxPollSeconds: 5, visibilityTimeout: 5 });
