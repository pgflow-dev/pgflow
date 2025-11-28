import { ControlPlane } from '@pgflow/edge-worker';
import { TestFlowE2E } from '../_flows/test_flow_e2e.ts';

ControlPlane.serve([TestFlowE2E]);
