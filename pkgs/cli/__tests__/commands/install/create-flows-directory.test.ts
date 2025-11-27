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
    const greetUserPath = path.join(flowsDir, 'greet-user.ts');

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(greetUserPath)).toBe(true);
  });

  it('should create index.ts with barrel export pattern', async () => {
    await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    const indexPath = path.join(flowsDir, 'index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    // Should have export for GreetUser
    expect(indexContent).toContain("export { GreetUser } from './greet-user.ts';");
    // Should have documenting comment
    expect(indexContent).toContain('Re-export all flows');
  });

  it('should create greet-user.ts with named export', async () => {
    await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    const greetUserPath = path.join(flowsDir, 'greet-user.ts');
    const greetUserContent = fs.readFileSync(greetUserPath, 'utf8');

    // Should use named export (not default)
    expect(greetUserContent).toContain('export const GreetUser');
    // Should import Flow from @pgflow/dsl
    expect(greetUserContent).toContain("import { Flow } from '@pgflow/dsl'");
    // Should have correct slug
    expect(greetUserContent).toContain("slug: 'greetUser'");
    // Should have input type with firstName and lastName
    expect(greetUserContent).toContain('type Input');
    expect(greetUserContent).toContain('firstName');
    expect(greetUserContent).toContain('lastName');
  });

  it('should create greet-user.ts with two steps showing dependsOn', async () => {
    await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    const greetUserPath = path.join(flowsDir, 'greet-user.ts');
    const greetUserContent = fs.readFileSync(greetUserPath, 'utf8');

    // Should have two steps
    expect(greetUserContent).toContain("slug: 'fullName'");
    expect(greetUserContent).toContain("slug: 'greeting'");
    // Second step should depend on first
    expect(greetUserContent).toContain("dependsOn: ['fullName']");
    // Second step should access result from first step
    expect(greetUserContent).toContain('input.fullName');
  });

  it('should not create files when they already exist', async () => {
    // Pre-create the directory and files
    fs.mkdirSync(flowsDir, { recursive: true });

    const indexPath = path.join(flowsDir, 'index.ts');
    const greetUserPath = path.join(flowsDir, 'greet-user.ts');

    fs.writeFileSync(indexPath, '// existing content');
    fs.writeFileSync(greetUserPath, '// existing content');

    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    // Should return false because no changes were needed
    expect(result).toBe(false);

    // Verify files still exist with original content
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');
    expect(fs.readFileSync(greetUserPath, 'utf8')).toBe('// existing content');
  });

  it('should create only missing files when some already exist', async () => {
    // Pre-create the directory and one file
    fs.mkdirSync(flowsDir, { recursive: true });

    const indexPath = path.join(flowsDir, 'index.ts');
    const greetUserPath = path.join(flowsDir, 'greet-user.ts');

    // Only create index.ts
    fs.writeFileSync(indexPath, '// existing content');

    const result = await createFlowsDirectory({
      supabasePath,
      autoConfirm: true,
    });

    // Should return true because greet-user.ts was created
    expect(result).toBe(true);

    // Verify index.ts was not modified
    expect(fs.readFileSync(indexPath, 'utf8')).toBe('// existing content');

    // Verify greet-user.ts was created
    expect(fs.existsSync(greetUserPath)).toBe(true);

    const greetUserContent = fs.readFileSync(greetUserPath, 'utf8');
    expect(greetUserContent).toContain('export const GreetUser');
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
    expect(fs.existsSync(path.join(flowsDir, 'greet-user.ts'))).toBe(true);
  });
});
