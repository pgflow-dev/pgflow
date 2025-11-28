import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createEdgeFunction } from '../../../src/commands/install/create-edge-function';
import { getVersion } from '../../../src/utils/get-version';

describe('createEdgeFunction', () => {
  let tempDir: string;
  let supabasePath: string;
  let pgflowFunctionDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgflow-test-'));
    supabasePath = path.join(tempDir, 'supabase');
    pgflowFunctionDir = path.join(supabasePath, 'functions', 'pgflow');
  });

  afterEach(() => {
    // Clean up the temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create both files when none exist', async () => {
    const result = await createEdgeFunction({
      supabasePath,
      autoConfirm: true,
    });

    // Should return true because files were created
    expect(result).toBe(true);

    // Verify directory was created
    expect(fs.existsSync(pgflowFunctionDir)).toBe(true);

    // Verify all files exist
    const indexPath = path.join(pgflowFunctionDir, 'index.ts');
    const denoJsonPath = path.join(pgflowFunctionDir, 'deno.json');

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(denoJsonPath)).toBe(true);

    // Verify index.ts content (namespace import from flows directory)
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain("import { ControlPlane } from '@pgflow/edge-worker'");
    expect(indexContent).toContain("import * as flows from '../../flows/index.ts'");
    expect(indexContent).toContain('ControlPlane.serve(flows)');

    // Verify deno.json content
    const denoJsonContent = fs.readFileSync(denoJsonPath, 'utf8');
    expect(denoJsonContent).toContain('"imports"');
    expect(denoJsonContent).toContain('@pgflow/edge-worker');
    expect(denoJsonContent).toContain('@pgflow/dsl');
  });

  it('should not create files when they already exist', async () => {
    // Pre-create the directory and files
    fs.mkdirSync(pgflowFunctionDir, { recursive: true });

    const indexPath = path.join(pgflowFunctionDir, 'index.ts');
    const denoJsonPath = path.join(pgflowFunctionDir, 'deno.json');

    fs.writeFileSync(indexPath, '// existing content');
    fs.writeFileSync(denoJsonPath, '// existing content');

    const result = await createEdgeFunction({
      supabasePath,
      autoConfirm: true,
    });

    // Should return false because no changes were needed
    expect(result).toBe(false);

    // Verify files still exist with original content
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');
    expect(fs.readFileSync(denoJsonPath, 'utf8')).toBe('// existing content');
  });

  it('should create only missing files when some already exist', async () => {
    // Pre-create the directory and one file
    fs.mkdirSync(pgflowFunctionDir, { recursive: true });

    const indexPath = path.join(pgflowFunctionDir, 'index.ts');
    const denoJsonPath = path.join(pgflowFunctionDir, 'deno.json');

    // Only create index.ts
    fs.writeFileSync(indexPath, '// existing content');

    const result = await createEdgeFunction({
      supabasePath,
      autoConfirm: true,
    });

    // Should return true because deno.json was created
    expect(result).toBe(true);

    // Verify index.ts was not modified
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');

    // Verify deno.json was created
    expect(fs.existsSync(denoJsonPath)).toBe(true);

    const denoJsonContent = fs.readFileSync(denoJsonPath, 'utf8');
    expect(denoJsonContent).toContain('"imports"');
  });

  it('should create parent directories if they do not exist', async () => {
    // Don't create anything - let the function create it all
    expect(fs.existsSync(supabasePath)).toBe(false);

    const result = await createEdgeFunction({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    // Verify all parent directories were created
    expect(fs.existsSync(supabasePath)).toBe(true);
    expect(fs.existsSync(path.join(supabasePath, 'functions'))).toBe(true);
    expect(fs.existsSync(pgflowFunctionDir)).toBe(true);

    // Verify files exist
    expect(fs.existsSync(path.join(pgflowFunctionDir, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(pgflowFunctionDir, 'deno.json'))).toBe(true);
  });

  it('should inject package version instead of @latest in deno.json', async () => {
    const result = await createEdgeFunction({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    const denoJsonPath = path.join(pgflowFunctionDir, 'deno.json');
    const denoJsonContent = fs.readFileSync(denoJsonPath, 'utf8');
    const denoJson = JSON.parse(denoJsonContent);

    const version = getVersion();

    // Verify version is not 'unknown'
    expect(version).not.toBe('unknown');

    // Verify that @latest is NOT used
    expect(denoJsonContent).not.toContain('@latest');

    // Verify that the actual version is used
    // Only edge-worker uses jsr:, others use npm:
    expect(denoJson.imports['@pgflow/core']).toBe(`npm:@pgflow/core@${version}`);
    expect(denoJson.imports['@pgflow/dsl']).toBe(`npm:@pgflow/dsl@${version}`);
    expect(denoJson.imports['@pgflow/edge-worker']).toBe(`jsr:@pgflow/edge-worker@${version}`);

    // Verify subpath exports include versions (needed for proper Deno import mapping)
    expect(denoJson.imports['@pgflow/core/']).toBe(`npm:@pgflow/core@${version}/`);
    expect(denoJson.imports['@pgflow/dsl/']).toBe(`npm:@pgflow/dsl@${version}/`);
    expect(denoJson.imports['@pgflow/edge-worker/']).toBe(`jsr:@pgflow/edge-worker@${version}/`);
  });
});
