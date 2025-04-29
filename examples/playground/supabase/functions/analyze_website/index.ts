import { EdgeWorker } from '@pgflow/edge-worker';
import AnalyzeWebsite from './analyze_website.ts';

EdgeWorker.start(AnalyzeWebsite);
