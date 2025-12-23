import fs from 'fs';
import path from 'path';
import { log, confirm } from '@clack/prompts';
import chalk from 'chalk';

const INDEX_TS_TEMPLATE = `// Re-export all flows from this directory
// Example: export { MyFlow } from './my-flow.ts';

export { GreetUser } from './greet-user.ts';
`;

const GREET_USER_TEMPLATE = `import { Flow } from '@pgflow/dsl';

type Input = {
  firstName: string;
  lastName: string;
};

export const GreetUser = new Flow<Input>({
  slug: 'greetUser',
})
  .step(
    { slug: 'fullName' },
    (flowInput) => \`\${flowInput.firstName} \${flowInput.lastName}\`
  )
  .step(
    { slug: 'greeting', dependsOn: ['fullName'] },
    (deps) => \`Hello, \${deps.fullName}!\`
  );
`;

export async function createFlowsDirectory({
  supabasePath,
  autoConfirm = false,
}: {
  supabasePath: string;
  autoConfirm?: boolean;
}): Promise<boolean> {
  const flowsDir = path.join(supabasePath, 'flows');

  const indexPath = path.join(flowsDir, 'index.ts');
  const greetUserPath = path.join(flowsDir, 'greet-user.ts');

  // Relative paths for display
  const relativeFlowsDir = 'supabase/flows';
  const relativeIndexPath = `${relativeFlowsDir}/index.ts`;
  const relativeGreetUserPath = `${relativeFlowsDir}/greet-user.ts`;

  // Check what needs to be created
  const filesToCreate: Array<{ path: string; relativePath: string }> = [];

  if (!fs.existsSync(indexPath)) {
    filesToCreate.push({ path: indexPath, relativePath: relativeIndexPath });
  }

  if (!fs.existsSync(greetUserPath)) {
    filesToCreate.push({ path: greetUserPath, relativePath: relativeGreetUserPath });
  }

  // If all files exist, return success
  if (filesToCreate.length === 0) {
    log.success('Flows directory already up to date');
    return false;
  }

  // Show preview and ask for confirmation only when not auto-confirming
  if (!autoConfirm) {
    const summaryMsg = [
      `Create ${chalk.cyan('flows/')} ${chalk.dim('(flow definitions directory)')}:`,
      '',
      ...filesToCreate.map((file) => `    ${chalk.bold(path.basename(file.relativePath))}`),
    ].join('\n');

    log.info(summaryMsg);

    const confirmResult = await confirm({
      message: `Create flows/?`,
    });

    if (confirmResult !== true) {
      log.warn('Flows directory installation skipped');
      return false;
    }
  }

  // Create the directory if it doesn't exist
  if (!fs.existsSync(flowsDir)) {
    fs.mkdirSync(flowsDir, { recursive: true });
  }

  // Create files
  if (filesToCreate.some((f) => f.path === indexPath)) {
    fs.writeFileSync(indexPath, INDEX_TS_TEMPLATE);
  }

  if (filesToCreate.some((f) => f.path === greetUserPath)) {
    fs.writeFileSync(greetUserPath, GREET_USER_TEMPLATE);
  }

  log.success('Flows directory created');

  return true;
}
