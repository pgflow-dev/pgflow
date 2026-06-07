import * as edgeWorker from '../pkgs/edge-worker/dist/index.js';
import * as internal from '../pkgs/edge-worker/dist/_internal.js';
import * as testing from '../pkgs/edge-worker/dist/testing.js';

const requiredExports = [
  ['EdgeWorker', edgeWorker.EdgeWorker],
  ['createQueueWorker', edgeWorker.createQueueWorker],
  ['createFlowWorker', edgeWorker.createFlowWorker],
  ['ProcessPlatformAdapter', edgeWorker.ProcessPlatformAdapter],
  ['SupabasePlatformAdapter', edgeWorker.SupabasePlatformAdapter],
];

for (const [name, value] of requiredExports) {
  if (value === undefined) {
    throw new Error(`Missing edge-worker export: ${name}`);
  }
}

if (Object.keys(internal).length === 0) {
  throw new Error('Expected _internal export surface to load');
}

if (Object.keys(testing).length === 0) {
  throw new Error('Expected testing export surface to load');
}
