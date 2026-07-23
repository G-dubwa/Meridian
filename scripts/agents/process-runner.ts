import { spawn } from 'node:child_process';
import type { CommandResult } from './types.js';

const MAX_CAPTURE_BYTES = 2_000_000;

function appendBounded(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8');
  return next.length <= MAX_CAPTURE_BYTES
    ? next
    : next.slice(next.length - MAX_CAPTURE_BYTES);
}

export async function runCommand(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly onPid?: (pid: number | null) => void;
}): Promise<CommandResult> {
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let spawnFailed = false;
  return new Promise((resolveResult) => {
    let settled = false;
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      detached: process.platform !== 'win32',
      env: input.environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    input.onPid?.(child.pid ?? null);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on('error', (error) => {
      spawnFailed = true;
      stderr = appendBounded(stderr, Buffer.from(error.message));
    });
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate('SIGTERM');
      setTimeout(() => {
        terminate('SIGKILL');
      }, 5_000).unref();
    }, input.timeoutMs);
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.onPid?.(null);
      resolveResult({
        args: input.args,
        command: input.command,
        durationMs: Date.now() - started,
        exitCode,
        signal,
        spawnFailed,
        stderr,
        stdout,
        timedOut,
      });
    });
  });
}

export function stopProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') process.kill(pid, 'SIGTERM');
    else process.kill(-pid, 'SIGTERM');
  } catch {
    // The child may already have exited; the persisted stop request still wins.
  }
}
