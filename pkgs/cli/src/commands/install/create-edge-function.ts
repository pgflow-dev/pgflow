import fs from 'fs';
import path from 'path';
import { log, confirm } from '@clack/prompts';
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

  // Relative paths for display
  const relativeFunctionDir = 'supabase/functions/pgflow';
  const relativeIndexPath = `${relativeFunctionDir}/index.ts`;
  const relativeDenoJsonPath = `${relativeFunctionDir}/deno.json`;

  // Check what needs to be created
  const filesToCreate: Array<{ path: string; relativePath: string }> = [];

  if (!fs.existsSync(indexPath)) {
    filesToCreate.push({ path: indexPath, relativePath: relativeIndexPath });
  }

  if (!fs.existsSync(denoJsonPath)) {
    filesToCreate.push({ path: denoJsonPath, relativePath: relativeDenoJsonPath });
  }

  // If all files exist, return success
  if (filesToCreate.length === 0) {
    const detailedMsg = [
      'ControlPlane edge function files are already in place:',
      `  ${chalk.bold(relativeIndexPath)}`,
      `  ${chalk.bold(relativeDenoJsonPath)}`,
    ].join('\n');

    log.success(detailedMsg);

    return false;
  }

  // Show what will be created with explanation
  const summaryMsg = [
    `Create ${chalk.cyan('functions/pgflow/')} ${chalk.dim('(Control Plane for flow registration and compilation)')}:`,
    '',
    ...filesToCreate.map((file) => `    ${chalk.bold(path.basename(file.relativePath))}`),
  ].join('\n');

  log.info(summaryMsg);

  // Get confirmation
  let shouldContinue = autoConfirm;

  if (!autoConfirm) {
    const confirmResult = await confirm({
      message: `Create functions/pgflow/?`,
    });

    shouldContinue = confirmResult === true;
  }

  if (!shouldContinue) {
    log.warn('Control Plane installation skipped');
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

  const successMsg = [
    `Control Plane installed`,
    `  ${chalk.dim('Learn more:')} ${chalk.blue.underline('https://pgflow.dev/concepts/compilation/')}`,
  ].join('\n');

  log.success(successMsg);

  return true;
}
