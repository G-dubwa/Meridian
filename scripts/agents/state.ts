import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseRunRecord } from './protocol.js';
import { secureDirectory } from './security.js';
import type { RunRecord, TransitionRecord } from './types.js';

export function runDirectory(
  root: string,
  runRoot: string,
  runId: string,
): string {
  return resolve(root, runRoot, runId);
}

export function loadRun(
  root: string,
  runRoot: string,
  runId: string,
): RunRecord {
  return parseRunRecord(
    JSON.parse(
      readFileSync(
        resolve(runDirectory(root, runRoot, runId), 'state.json'),
        'utf8',
      ),
    ) as unknown,
  );
}

export function saveRun(root: string, runRoot: string, run: RunRecord): void {
  const directory = runDirectory(root, runRoot, run.runId);
  secureDirectory(directory);
  const target = resolve(directory, 'state.json');
  const temporary = `${target}.tmp-${String(process.pid)}`;
  writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, target);
}

export function appendTransition(
  root: string,
  runRoot: string,
  runId: string,
  transition: TransitionRecord,
): void {
  const directory = runDirectory(root, runRoot, runId);
  secureDirectory(directory);
  appendFileSync(
    resolve(directory, 'transitions.jsonl'),
    `${JSON.stringify(transition)}\n`,
    { mode: 0o600 },
  );
}

export function transitionCount(
  root: string,
  runRoot: string,
  runId: string,
): number {
  const path = resolve(runDirectory(root, runRoot, runId), 'transitions.jsonl');
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).length;
}

export function acquireRunLock(
  root: string,
  lockRoot: string,
  workPackageId: string,
  staleAfterMinutes = 360,
): () => void {
  const directory = resolve(root, lockRoot);
  secureDirectory(directory);
  const path = resolve(directory, `${workPackageId}.lock`);
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch {
    let existing: { readonly pid?: unknown; readonly createdAt?: unknown };
    try {
      existing = JSON.parse(readFileSync(path, 'utf8')) as {
        readonly pid?: unknown;
        readonly createdAt?: unknown;
      };
    } catch {
      throw new Error(
        `Work package ${workPackageId} has a malformed lock requiring owner review.`,
      );
    }
    const pid = existing.pid;
    const createdAt = existing.createdAt;
    if (typeof pid !== 'number' || typeof createdAt !== 'string')
      throw new Error(
        `Work package ${workPackageId} has an invalid lock requiring owner review.`,
      );
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) {
      const stale =
        Date.now() - Date.parse(createdAt) > staleAfterMinutes * 60_000;
      throw new Error(
        `Work package ${workPackageId} has an ${stale ? 'stale ' : ''}active lock owned by PID ${String(pid)}.`,
      );
    }
    renameSync(path, `${path}.stale-${String(Date.now())}`);
    descriptor = openSync(path, 'wx', 0o600);
  }
  writeFileSync(
    descriptor,
    `${JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid })}\n`,
  );
  return () => {
    closeSync(descriptor);
    try {
      unlinkSync(path);
    } catch {
      // A stop/recovery operation may already have removed the lock.
    }
  };
}

export function handoffPath(
  root: string,
  runRoot: string,
  runId: string,
  fileName: string,
): string {
  const path = resolve(
    runDirectory(root, runRoot, runId),
    'handoffs',
    fileName,
  );
  secureDirectory(dirname(path));
  return path;
}
