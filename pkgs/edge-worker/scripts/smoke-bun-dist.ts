import {
  EdgeWorker,
  ProcessPlatformAdapter,
  SupabasePlatformAdapter,
} from '../dist/index.js';

const exportsToCheck = {
  EdgeWorker,
  ProcessPlatformAdapter,
  SupabasePlatformAdapter,
};

for (const [name, value] of Object.entries(exportsToCheck)) {
  if (value === undefined) {
    throw new Error(`Missing Bun smoke export: ${name}`);
  }
}

console.log('edge-worker bun dist smoke passed');
