import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse as parseTOML, stringify as stringifyTOML } from '@decimalturn/toml-patch';
import { updateConfigToml } from '../../../src/commands/install/update-config-toml';

describe('updateConfigToml', () => {
  let tempDir: string;
  let supabasePath: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgflow-test-'));
    supabasePath = path.join(tempDir, 'supabase');
    fs.mkdirSync(supabasePath, { recursive: true });
  });

  afterEach(() => {
    // Clean up the temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle minimal config without [db] section (issue #143)', async () => {
    // This is the minimal config from issue #143
    const minimalConfig = `project_id = "xxxxxxxxxxx"

[auth]
enabled = true
site_url = "https://siteurl.com"
additional_redirect_urls = ["http://127.0.0.1:8080", "https://127.0.0.1:8080", "http://localhost:8080", "https://localhost:8080"]

[auth.external.github]
enabled = true
client_id = "env(GITHUB_OAUTH_CLIENT_ID)"
secret = "env(GITHUB_OAUTH_CLIENT_SECRET)"
redirect_uri = "http://localhost:54321/auth/v1/callback"
`;

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, minimalConfig);

    // Call updateConfigToml - this should not hang or corrupt the file
    const result = await updateConfigToml({
      supabasePath,
      autoConfirm: true,
    });

    // Verify the function completed successfully
    expect(result).toBe(true);

    // Verify the file exists and is readable
    expect(fs.existsSync(configPath)).toBe(true);
    const updatedContent = fs.readFileSync(configPath, 'utf8');

    // Debug: log the actual output
    console.log('Updated config.toml content:');
    console.log(updatedContent);
    console.log('---');

    // First, verify the output is valid TOML that can be parsed
    let parsedConfig: any;
    expect(() => {
      parsedConfig = parseTOML(updatedContent);
    }).not.toThrow();

    // Then verify it can be round-tripped (parse -> stringify -> parse)
    // This catches cases where the TOML is "parseable" but malformed
    let roundTrippedConfig;
    expect(() => {
      const stringified = stringifyTOML(parsedConfig);
      roundTrippedConfig = parseTOML(stringified);
    }).not.toThrow();

    // Verify original content is preserved (check this FIRST to fail clearly if TOML is invalid)
    expect(parsedConfig.project_id, 'project_id should be preserved in parsed config').toBe('xxxxxxxxxxx');
    expect(parsedConfig.auth?.enabled).toBe(true);
    expect(parsedConfig.auth?.site_url).toBe('https://siteurl.com');
    expect(parsedConfig.auth?.external?.github?.enabled).toBe(true);

    // Verify required sections were added
    expect(parsedConfig.db?.pooler?.enabled).toBe(true);
    expect(parsedConfig.db?.pooler?.pool_mode).toBe('transaction');
    expect(parsedConfig.edge_runtime?.policy).toBe('per_worker');

    // Verify backup was created
    const backupPath = `${configPath}.backup`;
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('should handle config with existing [db] section but no pooler', async () => {
    const configWithDb = `project_id = "test123"

[db]
# Some other db config
major_version = 15

[auth]
enabled = true
`;

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, configWithDb);

    const result = await updateConfigToml({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    const updatedContent = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = parseTOML(updatedContent);

    expect(parsedConfig.db?.pooler?.enabled).toBe(true);
    expect(parsedConfig.db?.pooler?.pool_mode).toBe('transaction');
    expect(parsedConfig.db?.major_version).toBe(15);
  });

  it('should handle completely empty sections', async () => {
    const minimalConfig = `project_id = "test123"
`;

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, minimalConfig);

    const result = await updateConfigToml({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    const updatedContent = fs.readFileSync(configPath, 'utf8');

    // First verify the TOML is valid and parseable
    let parsedConfig: any;
    expect(() => {
      parsedConfig = parseTOML(updatedContent);
    }).not.toThrow();

    // Verify it can be round-tripped
    expect(() => {
      const stringified = stringifyTOML(parsedConfig);
      parseTOML(stringified);
    }).not.toThrow();

    // Verify original content is preserved
    expect(parsedConfig.project_id, 'project_id should be preserved in parsed config').toBe('test123');

    // Verify required sections were added
    expect(parsedConfig.db?.pooler?.enabled).toBe(true);
    expect(parsedConfig.db?.pooler?.pool_mode).toBe('transaction');
    expect(parsedConfig.edge_runtime?.policy).toBe('per_worker');
  });

  it('should not make changes if config is already correct', async () => {
    const correctConfig = `project_id = "test123"

[db.pooler]
enabled = true
pool_mode = "transaction"

[edge_runtime]
policy = "per_worker"
`;

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, correctConfig);

    const result = await updateConfigToml({
      supabasePath,
      autoConfirm: true,
    });

    // Should return false because no changes were needed
    expect(result).toBe(false);

    // Verify backup was NOT created
    const backupPath = `${configPath}.backup`;
    expect(fs.existsSync(backupPath)).toBe(false);
  });

  it('should throw clear error for invalid TOML syntax', async () => {
    const invalidToml = `project_id = "test123"

[db.pooler]
enabled = this is not valid toml syntax
`;

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, invalidToml);

    // Should throw with clear error message
    await expect(
      updateConfigToml({
        supabasePath,
        autoConfirm: true,
      })
    ).rejects.toThrow(/Invalid TOML syntax/);

    // Verify the error message includes the file path
    await expect(
      updateConfigToml({
        supabasePath,
        autoConfirm: true,
      })
    ).rejects.toThrow(/config\.toml/);
  });

  it('should handle full real-world config without losing any data', async () => {
    // Read the full config fixture (348 lines with all Supabase settings)
    const fixtureContent = fs.readFileSync(
      path.join(__dirname, '../../fixtures/full-config.toml'),
      'utf8'
    );

    const configPath = path.join(supabasePath, 'config.toml');
    fs.writeFileSync(configPath, fixtureContent);

    // Parse the original config to get "before" state
    const beforeConfig = parseTOML(fixtureContent);

    // Verify the fixture has the expected starting state (all 3 fields need updating)
    expect(beforeConfig.db?.pooler?.enabled).toBe(false);
    expect(beforeConfig.db?.pooler?.pool_mode).toBe('session');
    expect(beforeConfig.edge_runtime?.policy).toBe('oneshot');

    // Call updateConfigToml
    const result = await updateConfigToml({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    // Read and parse the updated config
    const updatedContent = fs.readFileSync(configPath, 'utf8');
    const afterConfig = parseTOML(updatedContent);

    // Verify it's valid TOML that can round-trip
    expect(() => {
      const stringified = stringifyTOML(afterConfig);
      parseTOML(stringified);
    }).not.toThrow();

    // Create expected config: clone before and modify all 3 required fields
    const expectedConfig = JSON.parse(JSON.stringify(beforeConfig));
    expectedConfig.db.pooler.enabled = true;
    expectedConfig.db.pooler.pool_mode = 'transaction';
    expectedConfig.edge_runtime.policy = 'per_worker';

    // Deep equality check: verify ONLY the 3 required fields changed
    // If this fails, vitest will show a detailed diff of the objects
    expect(afterConfig).toEqual(expectedConfig);

    // Also compare as formatted JSON strings for an alternate view if needed
    // This will show line-by-line diffs in test output if objects don't match
    const afterJSON = JSON.stringify(afterConfig, null, 2);
    const expectedJSON = JSON.stringify(expectedConfig, null, 2);
    expect(afterJSON, 'Config objects should match when serialized to JSON').toBe(expectedJSON);

    // Verify backup was created
    const backupPath = `${configPath}.backup`;
    expect(fs.existsSync(backupPath)).toBe(true);
  });
});
