#!/usr/bin/env node

/**
 * Packed-tarball smoke test for @pgflow/edge-worker.
 *
 * Instead of importing dist files directly, this script packs the three
 * fixed-group packages (dsl, core, edge-worker) into tarballs, creates a
 * temp consumer project, installs the tarballs, and verifies:
 *
 *   1. Runtime: all public exports resolve from bare specifiers
 *   2. Manifest: package.json main/types are correct, workspace: deps rewritten
 *   3. Types: tsc resolves declaration files without repo path aliases
 *
 * A package that passes this smoke test will work after `npm install`.
 */

import { execSync } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');

const PACKAGES_TO_PACK = [
  { dir: 'pkgs/dsl', expectedTarballPrefix: 'pgflow-dsl' },
  { dir: 'pkgs/core', expectedTarballPrefix: 'pgflow-core' },
  { dir: 'pkgs/edge-worker', expectedTarballPrefix: 'pgflow-edge-worker' },
];

/**
 * Run a command synchronously, returning stdout.
 * Throws on non-zero exit with captured output attached as capturedOutput.
 */
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
  } catch (err) {
    err.capturedOutput = (err.stdout || '') + (err.stderr || '');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Generated consumer files
// ---------------------------------------------------------------------------

const CONSUMER_PACKAGE_JSON = JSON.stringify({
  name: 'pgflow-edge-worker-packed-smoke',
  version: '1.0.0',
  private: true,
  type: 'module',
}, null, 2);

const RUNTIME_SMOKE_MJS = [
  "import { createRequire } from 'node:module';",
  "import * as edgeWorker from '@pgflow/edge-worker';",
  "import * as internal from '@pgflow/edge-worker/_internal';",
  "import * as testing from '@pgflow/edge-worker/testing';",
  '',
  'const failures = [];',
  '',
  'function expectDefined(label, value) {',
  "  if (value === undefined) failures.push('Missing export: ' + label);",
  '}',
  '',
  'function expectEqual(label, actual, expected) {',
  '  if (actual !== expected)',
  "    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));",
  '}',
  '',
  '// Root @pgflow/edge-worker',
  "expectDefined('EdgeWorker', edgeWorker.EdgeWorker);",
  "expectDefined('createQueueWorker', edgeWorker.createQueueWorker);",
  "expectDefined('createFlowWorker', edgeWorker.createFlowWorker);",
  "expectDefined('ProcessPlatformAdapter', edgeWorker.ProcessPlatformAdapter);",
  "expectDefined('SupabasePlatformAdapter', edgeWorker.SupabasePlatformAdapter);",
  '',
  '// _internal namespaces',
  "expectDefined('_internal.core.Worker', internal.core && internal.core.Worker);",
  "expectDefined('_internal.platform.ProcessPlatformAdapter', internal.platform && internal.platform.ProcessPlatformAdapter);",
  "expectDefined('_internal.flow.createFlowWorker', internal.flow && internal.flow.createFlowWorker);",
  "expectDefined('_internal.queue.createQueueWorker', internal.queue && internal.queue.createQueueWorker);",
  '',
  '// testing exports',
  "expectDefined('testing.configurePlatform', testing.configurePlatform);",
  '',
  '// package.json manifest checks',
  'const require = createRequire(import.meta.url);',
  "const pkg = require('@pgflow/edge-worker/package.json');",
  "expectEqual('package.json name', pkg.name, '@pgflow/edge-worker');",
  "expectEqual('package.json main', pkg.main, './dist/index.js');",
  "expectEqual('package.json types', pkg.types, './dist/index.d.ts');",
  '',
  '// workspace: protocol must be rewritten to real version in packed tarball',
  "for (const dep of ['@pgflow/core', '@pgflow/dsl']) {",
  '  const version = pkg.dependencies && pkg.dependencies[dep];',
  "  if (typeof version !== 'string' || version.startsWith('workspace:'))",
  "    failures.push('package.json dep ' + dep + ' must not use workspace: (got: ' + version + ')');",
  '}',
  '',
  'if (failures.length > 0) {',
  "  console.error('Runtime smoke FAILED (' + failures.length + ' issues):');",
  "  for (const f of failures) console.error('  - ' + f);",
  '  process.exit(1);',
  '}',
  '',
  "console.log('Runtime smoke: all assertions passed');",
  '',
].join('\n');

const CONSUMER_TS = [
  "import {",
  '  EdgeWorker,',
  '  createQueueWorker,',
  '  createFlowWorker,',
  '  ProcessPlatformAdapter,',
  '  SupabasePlatformAdapter,',
  '  type FlowWorkerConfig,',
  "} from '@pgflow/edge-worker';",
  '',
  "import * as internal from '@pgflow/edge-worker/_internal';",
  "import { configurePlatform, type SupabasePlatformDeps } from '@pgflow/edge-worker/testing';",
  '',
  '// Reference value imports to force declaration resolution',
  'void [',
  '  EdgeWorker,',
  '  createQueueWorker,',
  '  createFlowWorker,',
  '  ProcessPlatformAdapter,',
  '  SupabasePlatformAdapter,',
  '  internal.core.Worker,',
  '  internal.platform.ProcessPlatformAdapter,',
  '  internal.flow.createFlowWorker,',
  '  internal.queue.createQueueWorker,',
  '  configurePlatform,',
  '];',
  '',
  '// Reference type-only imports',
  'const _config: FlowWorkerConfig | null = null;',
  'const _deps: SupabasePlatformDeps | null = null;',
  'void [_config, _deps];',
  '',
].join('\n');

const TSCONFIG_JSON = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  },
  include: ['consumer.ts'],
}, null, 2);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const failures = [];
let tarballDir = '';
let consumerDir = '';

try {
  // 1. Pack all three fixed-group packages
  tarballDir = mkdtempSync(join(tmpdir(), 'pgflow-tarballs-'));
  console.log('Packing packages into ' + tarballDir);

  for (const pkg of PACKAGES_TO_PACK) {
    const pkgPath = join(workspaceRoot, pkg.dir);
    console.log('  Packing ' + pkg.dir + '...');
    run('pnpm pack --pack-destination "' + tarballDir + '"', { cwd: pkgPath });
  }

  const tarballs = readdirSync(tarballDir)
    .filter((f) => f.endsWith('.tgz'))
    .sort()
    .map((f) => join(tarballDir, f));

  if (tarballs.length !== PACKAGES_TO_PACK.length) {
    throw new Error(
      'Expected ' + PACKAGES_TO_PACK.length + ' tarballs, found ' + tarballs.length
    );
  }

  // Verify each expected package was packed
  for (const pkg of PACKAGES_TO_PACK) {
    const found = tarballs.some((t) => t.includes(pkg.expectedTarballPrefix));
    if (!found) {
      throw new Error('Tarball for ' + pkg.expectedTarballPrefix + ' not found');
    }
  }
  console.log('  Packed ' + tarballs.length + ' tarballs');

  // 2. Create temp consumer dir and generate files
  consumerDir = mkdtempSync(join(tmpdir(), 'pgflow-consumer-'));
  console.log('Setting up consumer in ' + consumerDir);

  writeFileSync(join(consumerDir, 'package.json'), CONSUMER_PACKAGE_JSON);
  writeFileSync(join(consumerDir, 'runtime-smoke.mjs'), RUNTIME_SMOKE_MJS);
  writeFileSync(join(consumerDir, 'consumer.ts'), CONSUMER_TS);
  writeFileSync(join(consumerDir, 'tsconfig.json'), TSCONFIG_JSON);

  // 3. Install tarballs as a real consumer would (plus @types/node for tsc)
  console.log('Installing tarballs...');
  const installCmd =
    'npm install --ignore-scripts --no-audit --no-fund --package-lock=false ' +
    tarballs.map((t) => '"' + t + '"').join(' ') +
    ' @types/node@18';
  run(installCmd, { cwd: consumerDir });
  console.log('  Installed ' + tarballs.length + ' packages + @types/node');

  // 4. Runtime smoke test
  console.log('Running runtime smoke test...');
  try {
    const result = run('node "' + join(consumerDir, 'runtime-smoke.mjs') + '"', {
      cwd: consumerDir,
    });
    console.log('  ' + result.trim());
  } catch (err) {
    failures.push('Runtime smoke test failed:\n' + (err.capturedOutput || err.message));
  }

  // 5. Type checking
  console.log('Running TypeScript type check...');
  const tscBin = join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    run('node "' + tscBin + '" --project "' + join(consumerDir, 'tsconfig.json') + '"', {
      cwd: consumerDir,
    });
    console.log('  Type check passed');
  } catch (err) {
    failures.push('Type check failed:\n' + (err.capturedOutput || err.message));
  }
} catch (err) {
  failures.push('Fatal: ' + (err.message || err) + (err.capturedOutput ? '\n' + err.capturedOutput : ''));
} finally {
  if (tarballDir) rmSync(tarballDir, { recursive: true, force: true });
  if (consumerDir) rmSync(consumerDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error('\nSmoke test FAILED (' + failures.length + ' issue(s)):');
  for (const f of failures) {
    console.error('\n' + f);
  }
  process.exit(1);
}

console.log('\nAll smoke tests passed');
