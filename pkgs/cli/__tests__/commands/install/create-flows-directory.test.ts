import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createFlowsDirectory } from '../../../src/commands/install/create-flows-directory';

describe('createFlowsDirectory', () => {
  let tempDir: string;
  let supabasePath: string;
  let flowsDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgflow-test-'));
    supabasePath = path.join(tempDir, 'supabase');
    flowsDir = path.join(supabasePath, 'flows');
  });

  afterEach(() => {
    // Clean up the temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create both files when none exist', async () => {
    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    // Should return true because files were created
    expect(result).toBe(true);

    // Verify directory was created
    expect(fs.existsSync(flowsDir)).toBe(true);

    // Verify all files exist
    const indexPath = path.join(flowsDir, 'index.ts');
    const exampleFlowPath = path.join(flowsDir, 'example-flow.ts');

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(exampleFlowPath)).toBe(true);
  });

  it('should create index.ts with barrel export pattern', async () => {
    await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    const indexPath = path.join(flowsDir, 'index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    // Should have export for ExampleFlow
    expect(indexContent).toContain("export { ExampleFlow } from './example-flow.ts';");
    // Should have documenting comment
    expect(indexContent).toContain('Re-export all flows');
  });

  it('should create example-flow.ts with named export', async () => {
    await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    const exampleFlowPath = path.join(flowsDir, 'example-flow.ts');
    const exampleFlowContent = fs.readFileSync(exampleFlowPath, 'utf8');

    // Should use named export (not default)
    expect(exampleFlowContent).toContain('export const ExampleFlow');
    // Should import Flow from @pgflow/dsl
    expect(exampleFlowContent).toContain("import { Flow } from '@pgflow/dsl'");
    // Should have correct slug
    expect(exampleFlowContent).toContain("slug: 'exampleFlow'");
    // Should have input type
    expect(exampleFlowContent).toContain('type Input');
    // Should have at least one step
    expect(exampleFlowContent).toContain('.step(');
  });

  it('should not create files when they already exist', async () => {
    // Pre-create the directory and files
    fs.mkdirSync(flowsDir, { recursive: true });

    const indexPath = path.join(flowsDir, 'index.ts');
    const exampleFlowPath = path.join(flowsDir, 'example-flow.ts');

    fs.writeFileSync(indexPath, '// existing content');
    fs.writeFileSync(exampleFlowPath, '// existing content');

    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    // Should return false because no changes were needed
    expect(result).toBe(false);

    // Verify files still exist with original content
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');
    expect(fs.readFileSync(exampleFlowPath, 'utf8')).toBe('// existing content');
  });

  it('should create only missing files when some already exist', async () => {
    // Pre-create the directory and one file
    fs.mkdirSync(flowsDir, { recursive: true });

    const indexPath = path.join(flowsDir, 'index.ts');
    const exampleFlowPath = path.join(flowsDir, 'example-flow.ts');

    // Only create index.ts
    fs.writeFileSync(indexPath, '// existing content');

    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    // Should return true because example-flow.ts was created
    expect(result).toBe(true);

    // Verify index.ts was not modified
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');

    // Verify example-flow.ts was created
    expect(fs.existsSync(exampleFlowPath)).toBe(true);

    const exampleContent = fs.readFileSync(exampleFlowPath, 'utf8');
    expect(exampleContent).toContain('export const ExampleFlow');
  });

  it('should create parent directories if they do not exist', async () => {
    // Don't create anything - let the function create it all
    expect(fs.existsSync(supabasePath)).toBe(false);

    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    expect(result).toBe(true);

    // Verify all parent directories were created
    expect(fs.existsSync(supabasePath)).toBe(true);
    expect(fs.existsSync(flowsDir)).toBe(true);

    // Verify files exist
    expect(fs.existsSync(path.join(flowsDir, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(flowsDir, 'example-flow.ts'))).toBe(true);
  });
});
