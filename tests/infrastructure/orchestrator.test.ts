import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseHandoff } from '../../scripts/agents/protocol.js';
import {
  commitValidatedWorkingTree,
  workingTreePaths,
} from '../../scripts/agents/git.js';
import { parseRunRecord } from '../../scripts/agents/protocol.js';
import { runCommand } from '../../scripts/agents/process-runner.js';
import {
  assertNoSensitiveText,
  assertPathsAllowed,
  safeChildEnvironment,
  scanSensitiveText,
} from '../../scripts/agents/security.js';
import {
  acquireRunLock,
  appendTransition,
  loadRun,
  saveRun,
} from '../../scripts/agents/state.js';
import type { RunRecord } from '../../scripts/agents/types.js';

const temporaryDirectories: string[] = [];

function temporary(): string {
  const directory = mkdtempSync(resolve(tmpdir(), 'meridian-agents-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runRecord(): RunRecord {
  return {
    activeChildPid: null,
    authorizedCostCeilingUsd: 0,
    baseCommit: 'a'.repeat(40),
    branchName: 'agent/test-run',
    candidateCommit: null,
    createdAt: '2026-07-23T00:00:00.000Z',
    estimatedCostUsd: 0,
    lastErrorCode: null,
    latestClaudeHandoff: null,
    latestCodexHandoff: null,
    pilotMode: true,
    protocolVersion: '1.0.0',
    qaBranchName: 'qa/test-run',
    qaCommit: null,
    repairCycles: 0,
    runId: 'infra-pilot-20260723',
    simulatedAgents: true,
    state: 'PREPARE',
    stopRequested: false,
    updatedAt: '2026-07-23T00:00:00.000Z',
    workPackageId: 'INFRA-PILOT',
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe('governed agent orchestration', () => {
  it('rejects stale, malformed, and prose-only handoffs', () => {
    const run = runRecord();
    const valid = {
      actor: 'codex',
      baseCommit: run.baseCommit,
      candidateCommit: 'b'.repeat(40),
      commandsExecuted: ['pnpm test'],
      evidencePaths: ['tests/autonomous-acceptance/example.spec.ts'],
      findings: [],
      humanGateRequired: false,
      nextRequestedActor: 'claude',
      protocolVersion: '1.0.0',
      requirementsEvaluated: ['REQ-001'],
      runId: run.runId,
      status: 'ready_for_qa',
      testResults: [{ command: 'pnpm test', durationMs: 1, status: 'passed' }],
      workPackageId: run.workPackageId,
    };
    expect(
      parseHandoff(valid, { actor: 'codex', repair: false, run }),
    ).toMatchObject({ candidateCommit: 'b'.repeat(40) });
    expect(() =>
      parseHandoff(
        { ...valid, runId: 'stale-run' },
        { actor: 'codex', repair: false, run },
      ),
    ).toThrow(/stale or mismatched/u);
    expect(() =>
      parseHandoff('Looks good to me.', {
        actor: 'codex',
        repair: false,
        run,
      }),
    ).toThrow(/must be an object/u);
    expect(() =>
      parseHandoff(
        { ...valid, unexpected: true },
        { actor: 'codex', repair: false, run },
      ),
    ).toThrow(/unexpected fields/u);
  });

  it('detects secret-shaped material and rejects path escape or env access', () => {
    const credentialFixture = ['ACCESS', '_TOKEN=', 'synthetic-value'].join('');
    expect(scanSensitiveText(credentialFixture)).toMatchObject([
      { code: 'credential_assignment' },
    ]);
    const connectionFixture = [
      'postgres',
      '://owner:',
      'synthetic-value',
      '@127.0.0.1/db',
    ].join('');
    expect(() => {
      assertNoSensitiveText(connectionFixture, 'artifact');
    }).toThrow(/secret scanning/u);
    const root = temporary();
    expect(() => {
      assertPathsAllowed(root, ['../outside.txt'], ['docs/qa/']);
    }).toThrow(/escapes/u);
    expect(() => {
      assertPathsAllowed(root, ['apps/web/.env.local'], ['apps/web/']);
    }).toThrow(/Environment files/u);
    expect(() => {
      assertPathsAllowed(root, ['src/product.ts'], ['docs/qa/']);
    }).toThrow(/approved scope/u);
  });

  it('closes child stdin and kills a timed-out process tree', async () => {
    const eof = await runCommand({
      args: [
        '-e',
        "process.stdin.on('end',()=>process.stdout.write('eof'));process.stdin.resume()",
      ],
      command: process.execPath,
      cwd: temporary(),
      environment: safeChildEnvironment({}),
      timeoutMs: 2_000,
    });
    expect(eof).toMatchObject({ exitCode: 0, stdout: 'eof', timedOut: false });
    const timedOut = await runCommand({
      args: ['-e', 'setInterval(()=>{},1000)'],
      command: process.execPath,
      cwd: temporary(),
      environment: safeChildEnvironment({}),
      timeoutMs: 50,
    });
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.signal).toBe('SIGTERM');
  });

  it('persists resumable state, append-only history, and exclusive locks', () => {
    const root = temporary();
    const run = runRecord();
    saveRun(root, '.agents/runs', run);
    expect(loadRun(root, '.agents/runs', run.runId)).toEqual(run);
    appendTransition(root, '.agents/runs', run.runId, {
      actor: 'supervisor',
      at: run.updatedAt,
      candidateCommit: null,
      cost: { amount: null, currency: 'USD', source: 'not_reported' },
      durationMs: null,
      from: null,
      reasonCode: 'run_planned',
      sequence: 1,
      to: 'PREPARE',
    });
    const history = readFileSync(
      resolve(root, '.agents/runs', run.runId, 'transitions.jsonl'),
      'utf8',
    );
    expect(history.trim().split('\n')).toHaveLength(1);
    const release = acquireRunLock(root, '.agents/locks', run.workPackageId);
    expect(() =>
      acquireRunLock(root, '.agents/locks', run.workPackageId),
    ).toThrow(/active lock/u);
    release();
    const releaseAgain = acquireRunLock(
      root,
      '.agents/locks',
      run.workPackageId,
    );
    releaseAgain();
  });

  it('rejects run state whose reported cost exceeds its owner ceiling', () => {
    expect(() => {
      parseRunRecord({
        ...runRecord(),
        authorizedCostCeilingUsd: 1,
        estimatedCostUsd: 1.01,
      });
    }).toThrow(/cost accounting/u);
  });

  it('keeps artifacts content-free in the fixture', () => {
    const root = temporary();
    const path = resolve(root, 'artifact.json');
    writeFileSync(path, '{"status":"approved"}\n', { mode: 0o600 });
    expect(readFileSync(path, 'utf8')).not.toMatch(
      /token|cookie|password|authorization code/iu,
    );
  });

  it('preserves tracked status paths before a supervisor-owned commit', async () => {
    const root = temporary();
    const path = resolve(root, 'docs/qa/marker.md');
    mkdirSync(resolve(root, 'docs/qa'), { recursive: true });
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    writeFileSync(path, 'candidate\n');
    execFileSync('git', ['add', '--all'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@meridian.invalid',
        'commit',
        '-m',
        'fixture',
      ],
      { cwd: root, stdio: 'ignore' },
    );
    writeFileSync(path, 'repaired\n');
    expect(await workingTreePaths(root)).toEqual(['docs/qa/marker.md']);
    const candidate = await commitValidatedWorkingTree(
      root,
      'INFRA-PILOT: supervised repair',
    );
    expect(candidate).toMatch(/^[0-9a-f]{40}$/u);
    expect(await workingTreePaths(root)).toEqual([]);
  });
});
