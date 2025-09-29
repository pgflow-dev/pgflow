import { spawn, ChildProcess } from 'child_process';

export interface ProcessOptions {
  command: string;
  args: string[];
  cwd?: string;
  readyPattern?: RegExp;
  timeout?: number;
  env?: Record<string, string>;
  debug?: boolean;
}

/**
 * Runs a callback function while a process is running in the background.
 * Waits for the process to be ready (if readyPattern is provided) before executing the callback.
 * Automatically cleans up the process when done or on error.
 */
export async function withRunningProcess<T>(
  options: ProcessOptions,
  callback: () => Promise<T>
): Promise<T> {
  const {
    command,
    args,
    cwd,
    readyPattern,
    timeout = 60000,
    env,
    debug = false,
  } = options;

  let child: ChildProcess | null = null;
  let processReady = false;
  let output = '';
  let errorOutput = '';

  return new Promise<T>((resolve, reject) => {
    // Spawn the child process
    child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (debug) {
      console.log(`[process] Starting: ${command} ${args.join(' ')}`);
    }

    // Handle process errors
    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to start process '${command}': ${err.message}\n` +
            `Working directory: ${cwd || process.cwd()}`
        )
      );
    });

    // Handle unexpected process exit
    child.on('exit', (code, signal) => {
      if (!processReady) {
        reject(
          new Error(
            `Process '${command}' exited unexpectedly with code ${code} and signal ${signal}\n` +
              `stdout: ${output}\n` +
              `stderr: ${errorOutput}`
          )
        );
      }
    });

    // Set up timeout if we're waiting for readiness
    let readinessTimeout: NodeJS.Timeout | null = null;
    if (readyPattern) {
      readinessTimeout = setTimeout(() => {
        if (child) {
          child.kill('SIGTERM');
        }
        reject(
          new Error(
            `Process '${command}' failed to become ready within ${timeout}ms\n` +
              `Looking for pattern: ${readyPattern}\n` +
              `stdout: ${output}\n` +
              `stderr: ${errorOutput}`
          )
        );
      }, timeout);
    }

    // Capture stdout
    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;

      if (debug) {
        process.stdout.write(`[${command}:stdout] ${chunk}`);
      }

      // Check for readiness
      if (!processReady && readyPattern && readyPattern.test(output)) {
        processReady = true;
        if (readinessTimeout) {
          clearTimeout(readinessTimeout);
        }

        if (debug) {
          console.log(`[process] Ready: ${command}`);
        }

        // Execute callback now that process is ready
        executeCallback();
      }
    });

    // Capture stderr
    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;

      if (debug) {
        process.stderr.write(`[${command}:stderr] ${chunk}`);
      }
    });

    // If no readyPattern, execute callback immediately
    if (!readyPattern) {
      processReady = true;
      executeCallback();
    }

    async function executeCallback() {
      try {
        const result = await callback();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        // Clean up the process
        if (child) {
          if (debug) {
            console.log(`[process] Stopping: ${command}`);
          }
          child.kill('SIGTERM');

          // Give process time to clean up gracefully
          setTimeout(() => {
            if (child && !child.killed) {
              if (debug) {
                console.log(`[process] Force killing: ${command}`);
              }
              child.kill('SIGKILL');
            }
          }, 2000);
        }
      }
    }
  });
}

/**
 * Helper to run a command and wait for it to complete
 */
export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; debug?: boolean } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const { cwd, env, debug = false } = options;

    if (debug) {
      console.log(`[command] Running: ${command} ${args.join(' ')}`);
    }

    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (debug) {
        process.stdout.write(`[${command}:stdout] ${chunk}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (debug) {
        process.stderr.write(`[${command}:stderr] ${chunk}`);
      }
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to run command '${command}': ${err.message}\n` +
            `Working directory: ${cwd || process.cwd()}`
        )
      );
    });

    child.on('close', (code) => {
      if (debug) {
        console.log(`[command] Exited with code: ${code}`);
      }
      resolve({ stdout, stderr, code });
    });
  });
}