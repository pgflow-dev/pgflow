import fs from 'fs';
import path from 'path';
import { log, confirm } from '@clack/prompts';
import chalk from 'chalk';
import { getVersion } from '../../utils/get-version.js';

const INDEX_TS_TEMPLATE = `import { EdgeWorker } from '@pgflow/edge-worker';
import { GreetUser } from '../../flows/greet-user.ts';

EdgeWorker.start(GreetUser);
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

export async function createExampleWorker({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  const functionsDir = path.join(supabasePath, 'functions');
  const workerDir = path.join(functionsDir, 'greet-user-worker');

  const indexPath = path.join(workerDir, 'index.ts');
  const denoJsonPath = path.join(workerDir, 'deno.json');

  // Relative paths for display
  const relativeWorkerDir = 'supabase/functions/greet-user-worker';
  const relativeIndexPath = `${relativeWorkerDir}/index.ts`;
  const relativeDenoJsonPath = `${relativeWorkerDir}/deno.json`;

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
    log.success('Example worker already up to date');
    return false;
  }

  // Show preview and ask for confirmation only when not auto-confirming
  if (!autoConfirm) {
    const summaryMsg = [
      `Create ${chalk.cyan('functions/greet-user-worker/')} ${chalk.dim('(example worker for GreetUser flow)')}:`,
      '',
      ...filesToCreate.map((file) => `    ${chalk.bold(path.basename(file.relativePath))}`),
    ].join('\n');

    log.info(summaryMsg);

    const confirmResult = await confirm({
      message: `Create functions/greet-user-worker/?`,
    });

    if (confirmResult !== true) {
      log.warn('Example worker installation skipped');
      return false;
    }
  }

  // Create the directory if it doesn't exist
  if (!fs.existsSync(workerDir)) {
    fs.mkdirSync(workerDir, { recursive: true });
  }

  // Create files
  if (filesToCreate.some((f) => f.path === indexPath)) {
    fs.writeFileSync(indexPath, INDEX_TS_TEMPLATE);
  }

  if (filesToCreate.some((f) => f.path === denoJsonPath)) {
    fs.writeFileSync(denoJsonPath, DENO_JSON_TEMPLATE(getVersion()));
  }

  log.success('Example worker created');

  return true;
}
