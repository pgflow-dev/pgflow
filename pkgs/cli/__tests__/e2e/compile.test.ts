import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCommand } from '../helpers/process';
import fs from 'fs';
import path from 'path';

/**
 * Helper to ensure Supabase is running in CLI package directory
 * Checks if Supabase is running and starts it if needed
 */
async function ensureSupabaseRunning(cliDir: string): Promise<void> {
  console.log('🔍 Checking if Supabase is running...');

  // Check if Supabase is already running
  try {
    const statusResult = await runCommand('pnpm', ['-C', cliDir, 'exec', 'supabase', 'status'], {
      cwd: cliDir,
    });

    if (statusResult.code === 0) {
      console.log('✓ Supabase is already running');
      return;
    }
  } catch (error) {
    // Status check failed, need to start
  }

  // Start Supabase
  console.log('🚀 Starting Supabase...');
  const startResult = await runCommand('pnpm', ['-C', cliDir, 'exec', 'supabase', 'start'], {
    cwd: cliDir,
    debug: true,
  });

  if (startResult.code !== 0) {
    console.error('Start stdout:', startResult.stdout);
    console.error('Start stderr:', startResult.stderr);
    throw new Error(`Supabase start failed with exit code ${startResult.code}`);
  }

  console.log('✓ Supabase started successfully');
}

/**
 * Helper to ensure Edge Functions are ready to accept requests
 * Retries HTTP requests until the function responds
 */
async function ensureFunctionReady(baseUrl: string, flowSlug: string): Promise<void> {
  console.log('⏳ Ensuring Edge Functions are ready...');

  const maxRetries = 30;
  const retryDelayMs = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to hit the /flows/:slug endpoint to check if function is running
      const response = await fetch(`${baseUrl}/flows/${flowSlug}`);

      // Any response (even 404 or 500) means the function is running
      if (response.status > 0) {
        console.log('✓ Edge Functions are ready');
        return;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Edge Functions not ready after ${maxRetries} retries: ${error}`);
      }
      console.log(`Retry ${i + 1}/${maxRetries}: Edge Functions not ready yet, waiting...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * Helper to get the Supabase Edge Functions base URL from status output
 */
async function getEdgeFunctionUrl(cliDir: string): Promise<string> {
  const statusResult = await runCommand('pnpm', ['-C', cliDir, 'exec', 'supabase', 'status'], {
    cwd: cliDir,
  });

  // Parse the status output to find the API URL
  // Example line: "API URL: http://127.0.0.1:54321"
  const apiUrlMatch = statusResult.stdout.match(/API URL:\s*(https?:\/\/[^\s]+)/);
  if (!apiUrlMatch) {
    throw new Error('Could not find API URL in Supabase status output');
  }

  const apiUrl = apiUrlMatch[1];
  return `${apiUrl}/functions/v1/pgflow`;
}

describe('pgflow compile (e2e)', () => {
  const cliDir = process.cwd();
  const workspaceRoot = path.resolve(cliDir, '..', '..');
  const supabasePath = path.join(cliDir, 'supabase');
  const flowSlug = 'test_flow_e2e';

  beforeAll(async () => {
    // Ensure Supabase is running
    await ensureSupabaseRunning(cliDir);

    // Get Edge Function URL
    const baseUrl = await getEdgeFunctionUrl(cliDir);

    // Ensure Edge Functions are ready
    await ensureFunctionReady(baseUrl, flowSlug);
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    // Clean up any test migration files
    const migrationsDir = path.join(supabasePath, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const testMigrations = fs
        .readdirSync(migrationsDir)
        .filter(f => f.includes(flowSlug) && f.endsWith('.sql'));

      for (const file of testMigrations) {
        const filePath = path.join(migrationsDir, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️  Cleaned up test migration: ${file}`);
      }
    }
  });

  it('should compile flow and create migration', async () => {
    // Run pgflow compile command
    console.log(`⚙️  Compiling flow '${flowSlug}' via ControlPlane`);
    const compileResult = await runCommand(
      'node',
      [path.join(cliDir, 'dist', 'index.js'), 'compile', flowSlug, '--supabase-path', supabasePath],
      {
        cwd: cliDir,
        env: { PATH: `${workspaceRoot}/node_modules/.bin:${process.env.PATH}` },
        debug: true,
      }
    );

    // Check if compilation was successful
    if (compileResult.code !== 0) {
      console.error('Compile stdout:', compileResult.stdout);
      console.error('Compile stderr:', compileResult.stderr);
      throw new Error(`Compilation failed with exit code ${compileResult.code}`);
    }

    console.log('✓ Flow compiled successfully');

    // Verify migration was created
    console.log('✅ Verifying migration file');
    const migrationsDir = path.join(supabasePath, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.includes(flowSlug) && f.endsWith('.sql'));

    expect(migrationFiles.length).toBe(1);
    console.log(`✓ Found migration: ${migrationFiles[0]}`);

    // Verify migration contains expected SQL
    const migrationPath = path.join(migrationsDir, migrationFiles[0]);
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    expect(migrationContent).toContain(`pgflow.create_flow('${flowSlug}'`);
    expect(migrationContent).toContain(`pgflow.add_step('${flowSlug}', 'step1'`);
    console.log('✓ Migration content is correct');

    console.log('✨ Compile test complete');
  }, 60000); // 1 minute timeout for the test
});
