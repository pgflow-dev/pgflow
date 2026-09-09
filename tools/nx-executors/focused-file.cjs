const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

function selectedFile(args) {
  const prefix = '--file=';
  if (typeof args !== 'string' || !args.startsWith(prefix)) {
    throw new Error('Use --args=--file=<relative-test-file>.');
  }

  const file = args.slice(prefix.length);
  if (!file || /[\0\r\n]/.test(file)) {
    throw new Error('Use --args=--file=<relative-test-file>.');
  }
  return file;
}

module.exports = async function focusedFile(options, context) {
  let file;
  try {
    file = selectedFile(options.args);
  } catch (error) {
    console.error(error.message);
    return { success: false };
  }

  const root = context.root;
  const scripts = join(root, 'scripts');
  const pgtap = context.projectName === 'core'
    && context.targetName === 'test:pgtap:file';
  const integration = context.projectName === 'edge-worker'
    && context.targetName === 'test:integration:file';
  if (!pgtap && !integration) {
    console.error('focused-file only supports the configured focused test targets.');
    return { success: false };
  }

  const project = pgtap ? 'pkgs/core' : 'pkgs/edge-worker';
  const runner = pgtap
    ? join(root, 'pkgs/core/scripts/run-pgtap-file')
    : join(root, 'pkgs/edge-worker/scripts/run-integration.sh');
  const command = pgtap
    ? join(scripts, 'with-supabase-lock.sh')
    : join(scripts, 'with-integration-lock.sh');
  const commandArgs = pgtap
    ? [join(root, project), runner, file]
    : [runner, file];
  const result = spawnSync(command, commandArgs, {
    cwd: join(root, project),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
  }
  return { success: result.status === 0 && !result.error };
};
