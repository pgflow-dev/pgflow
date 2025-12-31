import { ControlPlane } from '@pgflow/edge-worker';
import * as flows from '../../flows/index.ts';

ControlPlane.serve(flows);
