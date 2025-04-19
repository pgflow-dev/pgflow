import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import compileCommand from './index';

// Mock dependencies
vi.mock('fs');
vi.mock('child_process');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  spinner: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('compile command', () => {
  const mockCommand = {
    command: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    argument: vi.fn().mockReturnThis(),
    requiredOption: vi.fn().mockReturnThis(),
    action: vi.fn().mockImplementation((fn) => {
      // Store the action function for testing
      mockCommand.actionFn = fn;
      return mockCommand;
    }),
    actionFn: null as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fs.existsSync to return true for all paths
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    // Mock fs.mkdirSync
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    
    // Mock fs.writeFileSync
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    
    // Mock child_process.spawn
    const mockSpawnInstance = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    
    vi.mocked(spawn).mockReturnValue(mockSpawnInstance as any);
    
    // Setup event handlers to simulate successful compilation
    mockSpawnInstance.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('SQL statement 1;\nSQL statement 2;'));
      }
      return mockSpawnInstance.stdout;
    });
    
    mockSpawnInstance.stderr.on.mockImplementation((event, callback) => {
      return mockSpawnInstance.stderr;
    });
    
    mockSpawnInstance.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0); // Exit code 0 means success
      }
      return mockSpawnInstance;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should register the compile command', () => {
    compileCommand(mockCommand as any);
    
    expect(mockCommand.command).toHaveBeenCalledWith('compile');
    expect(mockCommand.description).toHaveBeenCalled();
    expect(mockCommand.argument).toHaveBeenCalledWith('<flowPath>', expect.any(String));
    expect(mockCommand.requiredOption).toHaveBeenCalledWith(
      '--deno-json <denoJsonPath>',
      expect.any(String)
    );
    expect(mockCommand.action).toHaveBeenCalled();
  });

  it('should compile a flow and create a migration file', async () => {
    compileCommand(mockCommand as any);
    
    // Call the action function with test arguments
    await mockCommand.actionFn('test-flow.ts', { denoJson: 'deno.json' });
    
    // Check that paths were validated
    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    
    // Check that migrations directory was created if needed
    expect(fs.mkdirSync).toHaveBeenCalled();
    
    // Check that Deno was spawned with correct arguments
    expect(spawn).toHaveBeenCalledWith('deno', [
      'run',
      '--allow-read',
      '--import-map=expect.any(String)',
      expect.any(String), // Script path
      expect.any(String), // Flow path
    ]);
    
    // Check that the SQL was written to a file
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('pgflow_'),
      'SQL statement 1;\nSQL statement 2;'
    );
  });

  it('should handle errors when flow file does not exist', async () => {
    compileCommand(mockCommand as any);
    
    // Mock fs.existsSync to return false for the flow file
    vi.mocked(fs.existsSync).mockImplementationOnce(() => false);
    
    // Mock process.exit
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    
    // Call the action function with test arguments
    await mockCommand.actionFn('non-existent-flow.ts', { denoJson: 'deno.json' });
    
    // Check that error was logged and process.exit was called
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
