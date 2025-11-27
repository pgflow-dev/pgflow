import fs from 'fs';
import path from 'path';
import { log, confirm, note } from '@clack/prompts';
import chalk from 'chalk';
import { getVersion } from '../../utils/get-version.js';

const INDEX_TS_TEMPLATE = `import { ControlPlane } from '@pgflow/edge-worker';
// Import your flows here:
// import { MyFlow } from '../_flows/my_flow.ts';

ControlPlane.serve([
  // Add your flows here:
  // MyFlow,
]);
`;

const DENO_JSON_TEMPLATE = (version: string) => `{
  "imports": {
    "@pgflow/core": "npm:@pgflow/core@${version}",
    "@pgflow/core/": "npm:@pgflow/core@${version}/",
    "@pgflow/dsl": "npm:@pgflow/dsl@${version}",
    "@pgflow/dsl/": "npm:@pgflow/dsl@${version}/",
    "@pgflow/dsl/supabase": "npm:@pgflow/dsl@${version}/supabase",
    "@pgflow/edge-worker": "jsr:@pgflow/edge-worker@${version}",
    "@pgflow/edge-worker/": "jsr:@pgflow/edge-worker@${version}/",
    "@pgflow/edge-worker/_internal": "jsr:@pgflow/edge-worker@${version}/_internal"
  }
}
`;

export async function createEdgeFunction({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  const functionsDir = path.join(supabasePath, 'functions');
  const pgflowFunctionDir = path.join(functionsDir, 'pgflow');

  const indexPath = path.join(pgflowFunctionDir, 'index.ts');
  const denoJsonPath = path.join(pgflowFunctionDir, 'deno.json');

  // Check what needs to be created
  const filesToCreate: Array<{ path: string; name: string }> = [];

  if (!fs.existsSync(indexPath)) {
    filesToCreate.push({ path: indexPath, name: 'index.ts' });
  }

  if (!fs.existsSync(denoJsonPath)) {
    filesToCreate.push({ path: denoJsonPath, name: 'deno.json' });
  }

  // If all files exist, return success
  if (filesToCreate.length === 0) {
    log.success('ControlPlane edge function files are already in place');

    const detailedMsg = [
      'Existing files:',
      `  ${chalk.dim('•')} ${chalk.bold('supabase/functions/pgflow/index.ts')}`,
      `  ${chalk.dim('•')} ${chalk.bold('supabase/functions/pgflow/deno.json')}`,
    ].join('\n');

    note(detailedMsg, 'ControlPlane Edge Function');

    return false;
  }

  // Show what will be created
  log.info(`Found ${filesToCreate.length} file${filesToCreate.length !== 1 ? 's' : ''} to create`);

  const summaryParts = [`${chalk.green('Files to create:')}\n${filesToCreate
    .map((file) => `${chalk.green('+')} ${file.name}`)
    .join('\n')}`];

  note(summaryParts.join('\n'), 'ControlPlane Edge Function');

  // Get confirmation
  let shouldContinue = autoConfirm;

  if (!autoConfirm) {
    const confirmResult = await confirm({
      message: `Create ${filesToCreate.length} file${filesToCreate.length !== 1 ? 's' : ''}?`,
    });

    shouldContinue = confirmResult === true;
  }

  if (!shouldContinue) {
    log.warn('Edge function setup skipped');
    return false;
  }

  // Create the directory if it doesn't exist
  if (!fs.existsSync(pgflowFunctionDir)) {
    fs.mkdirSync(pgflowFunctionDir, { recursive: true });
  }

  // Create files
  if (filesToCreate.some((f) => f.path === indexPath)) {
    fs.writeFileSync(indexPath, INDEX_TS_TEMPLATE);
  }

  if (filesToCreate.some((f) => f.path === denoJsonPath)) {
    fs.writeFileSync(denoJsonPath, DENO_JSON_TEMPLATE(getVersion()));
  }

  // Show success message
  const detailedSuccessMsg = [
    `Created ${filesToCreate.length} file${filesToCreate.length !== 1 ? 's' : ''}:`,
    ...filesToCreate.map((file) => `  ${chalk.bold(file.name)}`),
  ].join('\n');

  log.success(detailedSuccessMsg);

  return true;
}
