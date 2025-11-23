import { ControlPlane } from '@pgflow/edge-worker';
import { flows } from './flows.ts';

ControlPlane.serve(flows);
