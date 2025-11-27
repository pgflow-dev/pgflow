import { describe, it, expect, afterAll } from 'vitest';
import { runCommand } from '../helpers/process';
import fs from 'fs';
import path from 'path';

const CONTROL_PLANE_URL = 'http://127.0.0.1:50621/functions/v1/pgflow';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

/**
 * Helper to ensure the pgflow function is responsive
 * Makes initial request and retries until server is ready
 */
async function ensureServerReady() {
  console.log('⏳ Ensuring pgflow function is ready...');

  const maxRetries = 15;
  const retryDelayMs = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to hit the /flows/:slug endpoint to wake up the function
      const response = await fetch(`${CONTROL_PLANE_URL}/flows/test`, {
        headers: {
          'apikey': PUBLISHABLE_KEY,
        },
      });

      // Any response (even 404) means the function is running
      // But 5xx errors mean the gateway can't reach the function container
      if (response.status > 0 && response.status < 500) {
        console.log(`✓ pgflow function is ready (status: ${response.status})`);
        return;
      }

      // 5xx errors - function container not ready, keep retrying
      console.log(`  Retry ${i + 1}/${maxRetries}: Got ${response.status}, function not ready yet...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Server not ready after ${maxRetries} retries: ${error}`);
      }
      console.log(`  Retry ${i + 1}/${maxRetries}: Server not ready yet, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * E2E test for pgflow compile command.
 *
 * Prerequisites (handled by Nx targets):
 * - serve:functions:e2e: Starts Edge Functions server (with readyWhen)
 *
 * Run via: pnpm nx test:e2e:compile cli
 */
describe('pgflow compile (e2e)', () => {
  const cliDir = process.cwd();
  const workspaceRoot = path.resolve(cliDir, '..', '..');
  const supabasePath = path.join(cliDir, 'supabase');
  const flowSlug = 'test_flow_e2e';

  afterAll(async () => {
    // Clean up any test migration files
    const migrationsDir = path.join(supabasePath, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const testMigrations = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.includes(flowSlug) && f.endsWith('.sql'));

      for (const file of testMigrations) {
        const filePath = path.join(migrationsDir, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️  Cleaned up test migration: ${file}`);
      }
    }
  });

  it('should compile flow and create migration', async () => {
    // Wait for Edge Functions server to be fully ready
    await ensureServerReady();

    // Run pgflow compile command
    // Note: CLI package uses port 544xx to avoid conflicts with demo app (543xx)
    console.log(`⚙️  Compiling flow '${flowSlug}' via ControlPlane`);
    const compileResult = await runCommand(
      'node',
      [
        path.join(cliDir, 'dist', 'index.js'),
        'compile',
        flowSlug,
        '--supabase-path',
        supabasePath,
        '--control-plane-url',
        CONTROL_PLANE_URL,
      ],
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
      throw new Error(
        `Compilation failed with exit code ${compileResult.code}`
      );
    }

    console.log('✓ Flow compiled successfully');

    // Verify migration was created
    console.log('✅ Verifying migration file');
    const migrationsDir = path.join(supabasePath, 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.includes(flowSlug) && f.endsWith('.sql'));

    expect(migrationFiles.length).toBe(1);
    console.log(`✓ Found migration: ${migrationFiles[0]}`);

    // Verify migration contains expected SQL
    const migrationPath = path.join(migrationsDir, migrationFiles[0]);
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    expect(migrationContent).toContain(`pgflow.create_flow('${flowSlug}'`);
    expect(migrationContent).toContain(
      `pgflow.add_step('${flowSlug}', 'step1'`
    );
    console.log('✓ Migration content is correct');

    console.log('✨ Compile test complete');
  }, 60000); // 1 minute timeout for the test

  it('should fail with helpful error for unknown flow', async () => {
    // Wait for Edge Functions server to be fully ready
    await ensureServerReady();

    // Run pgflow compile command with non-existent flow
    console.log('⚙️  Compiling non-existent flow to test error handling');
    const compileResult = await runCommand(
      'node',
      [
        path.join(cliDir, 'dist', 'index.js'),
        'compile',
        'nonexistent_flow',
        '--supabase-path',
        supabasePath,
        '--control-plane-url',
        CONTROL_PLANE_URL,
      ],
      {
        cwd: cliDir,
        env: { PATH: `${workspaceRoot}/node_modules/.bin:${process.env.PATH}` },
        debug: true,
      }
    );

    // Should fail with non-zero exit code
    expect(compileResult.code).not.toBe(0);

    // Should contain helpful error message about flow not found
    const output = compileResult.stderr + compileResult.stdout;
    expect(output).toMatch(/not found|flows\.ts/i);

    console.log('✓ Unknown flow correctly returned error');
    console.log('✨ Unknown flow error test complete');
  }, 60000); // 1 minute timeout for the test
});
