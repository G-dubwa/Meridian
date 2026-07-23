import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCommand } from './process-runner.js';
import { safeChildEnvironment } from './security.js';

const GIT_TIMEOUT_MS = 120_000;

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runCommand({
    args,
    command: 'git',
    cwd,
    environment: safeChildEnvironment({}),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0)
    throw new Error(`Git command failed: git ${args.join(' ')}`);
  return result.stdout.trim();
}

export async function resolveCommit(
  cwd: string,
  reference: string,
): Promise<string> {
  const value = await git(cwd, ['rev-parse', `${reference}^{commit}`]);
  if (!/^[0-9a-f]{40}$/u.test(value))
    throw new Error(`Reference did not resolve to a full commit: ${reference}`);
  return value;
}

export async function exactHead(cwd: string, expected: string): Promise<void> {
  const actual = await resolveCommit(cwd, 'HEAD');
  if (actual !== expected)
    throw new Error(
      `Exact commit mismatch: expected ${expected}, received ${actual}.`,
    );
}

export async function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await runCommand({
    args: ['merge-base', '--is-ancestor', ancestor, descendant],
    command: 'git',
    cwd,
    environment: safeChildEnvironment({}),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  throw new Error('Git ancestry verification failed.');
}

export async function changedPaths(
  cwd: string,
  baseCommit: string,
  candidateCommit = 'HEAD',
): Promise<readonly string[]> {
  const output = await git(cwd, [
    'diff',
    '--name-only',
    `${baseCommit}..${candidateCommit}`,
  ]);
  return output ? output.split('\n').filter(Boolean) : [];
}

export async function assertClean(cwd: string): Promise<void> {
  const paths = await workingTreePaths(cwd);
  if (paths.length > 0) throw new Error('Agent worktree is not clean.');
}

export async function workingTreePaths(
  cwd: string,
): Promise<readonly string[]> {
  const output = await git(cwd, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  return output
    ? output
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3))
        .map((path) => path.split(' -> ').at(-1) ?? path)
    : [];
}

export async function commitValidatedWorkingTree(
  cwd: string,
  message: string,
): Promise<string> {
  const paths = await workingTreePaths(cwd);
  if (paths.length === 0)
    throw new Error('Supervisor cannot commit an empty working tree.');
  await git(cwd, ['add', '--all']);
  await git(cwd, [
    '-c',
    'user.name=Meridian Agent Supervisor',
    '-c',
    'user.email=agents@meridian.invalid',
    'commit',
    '--no-gpg-sign',
    '--no-verify',
    '-m',
    message,
  ]);
  await assertClean(cwd);
  return resolveCommit(cwd, 'HEAD');
}

export async function createWorktrees(input: {
  readonly controlRoot: string;
  readonly baseCommit: string;
  readonly branchName: string;
  readonly worktreeRoot: string;
}): Promise<{ readonly builder: string; readonly auditor: string }> {
  const builder = resolve(
    input.controlRoot,
    input.worktreeRoot,
    'codex-builder',
  );
  const auditor = resolve(
    input.controlRoot,
    input.worktreeRoot,
    'claude-auditor',
  );
  if (existsSync(builder) && existsSync(auditor)) {
    await exactHead(builder, input.baseCommit);
    await exactHead(auditor, input.baseCommit);
    await assertClean(builder);
    await assertClean(auditor);
    return { auditor, builder };
  }
  if (existsSync(builder) || existsSync(auditor))
    throw new Error(
      'A partial agent-worktree set requires owner-reviewed cleanup before resume.',
    );
  await git(input.controlRoot, [
    'worktree',
    'add',
    '-b',
    input.branchName,
    builder,
    input.baseCommit,
  ]);
  try {
    await git(input.controlRoot, [
      'worktree',
      'add',
      '--detach',
      auditor,
      input.baseCommit,
    ]);
  } catch (error) {
    await git(input.controlRoot, ['worktree', 'remove', '--force', builder]);
    throw error;
  }
  return { auditor, builder };
}

export async function materializeAuditorCommit(
  auditor: string,
  candidateCommit: string,
): Promise<void> {
  await assertClean(auditor);
  await git(auditor, ['switch', '--detach', candidateCommit]);
  await exactHead(auditor, candidateCommit);
}

export async function fastForwardBuilder(
  builder: string,
  candidateCommit: string,
): Promise<void> {
  await assertClean(builder);
  await git(builder, ['merge', '--ff-only', candidateCommit]);
  await exactHead(builder, candidateCommit);
}

export async function recordQaBranch(
  controlRoot: string,
  branchName: string,
  qaCommit: string,
): Promise<void> {
  await git(controlRoot, ['branch', '--force', branchName, qaCommit]);
}

export async function pushExactBranch(
  controlRoot: string,
  commit: string,
  branchName: string,
): Promise<void> {
  await git(controlRoot, [
    'push',
    'origin',
    `${commit}:refs/heads/${branchName}`,
  ]);
}

export async function removeAgentWorktrees(
  controlRoot: string,
  paths: readonly string[],
): Promise<void> {
  for (const path of paths)
    if (existsSync(path))
      await git(controlRoot, ['worktree', 'remove', '--force', path]);
  await git(controlRoot, ['worktree', 'prune']);
}
