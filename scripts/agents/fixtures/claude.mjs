import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const handoffPath = process.env.MERIDIAN_AGENT_HANDOFF_PATH;
const runId = process.env.MERIDIAN_RUN_ID;
const workPackageId = process.env.MERIDIAN_WORK_PACKAGE_ID;
const baseCommit = process.env.MERIDIAN_BASE_COMMIT;
const candidateCommit =
  process.env.MERIDIAN_CANDIDATE_COMMIT ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!handoffPath || !runId || !workPackageId || !baseCommit)
  throw new Error('Synthetic Claude fixture is missing governed context.');

const marker = readFileSync(resolve('docs/qa/pilot-target.md'), 'utf8');
const approved = marker.includes('Status: repaired');
if (!approved) {
  const acceptancePath = resolve('docs/qa/pilot-independent-plan.md');
  writeFileSync(
    acceptancePath,
    '# Synthetic independent acceptance plan\n\nPILOT-002 requires the exact candidate marker to report repaired status.\n',
  );
}
const finding = {
  evidencePaths: ['docs/qa/pilot-target.md'],
  id: 'QA-001',
  requirementId: 'PILOT-002',
  severity: 'medium',
  status: approved ? 'resolved' : 'open',
  summary: approved
    ? 'Exact retest commit contains the required repaired marker.'
    : 'Synthetic marker remains candidate and requires one repair cycle.',
};
const handoff = {
  acceptancePlan: [
    {
      evidence: ['docs/qa/pilot-target.md'],
      expectedResult: 'The marker status is repaired before QA approval.',
      observableBehaviour: 'The committed synthetic marker exposes its state.',
      requirementId: 'PILOT-002',
      scenario: 'Read the marker from the exact detached candidate commit.',
    },
  ],
  actor: 'claude',
  baseCommit,
  candidateCommit,
  commandsExecuted: [
    'read docs/qa/pilot-target.md',
    ...(!approved
      ? ['leave docs/qa/pilot-independent-plan.md unstaged for supervisor']
      : ['git rev-parse HEAD']),
  ],
  evidencePaths: ['docs/qa/pilot-target.md'],
  findings: [finding],
  humanGateRequired: false,
  nextRequestedActor: approved ? 'supervisor' : 'codex',
  protocolVersion: '1.0.0',
  requirementsEvaluated: ['PILOT-001', 'PILOT-002'],
  runId,
  status: approved ? 'approved' : 'changes_requested',
  testResults: [
    {
      command: 'synthetic black-box marker inspection',
      durationMs: 0,
      status: approved ? 'passed' : 'failed',
    },
  ],
  workPackageId,
};
mkdirSync(dirname(handoffPath), { recursive: true });
writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, {
  mode: 0o600,
});
chmodSync(handoffPath, 0o600);
