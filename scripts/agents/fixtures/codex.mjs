import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const handoffPath = process.env.MERIDIAN_AGENT_HANDOFF_PATH;
const runId = process.env.MERIDIAN_RUN_ID;
const workPackageId = process.env.MERIDIAN_WORK_PACKAGE_ID;
const baseCommit = process.env.MERIDIAN_BASE_COMMIT;
const repair = process.env.MERIDIAN_AGENT_REPAIR === 'true';
if (!handoffPath || !runId || !workPackageId || !baseCommit)
  throw new Error('Synthetic Codex fixture is missing governed context.');

const markerPath = resolve('docs/qa/pilot-target.md');
mkdirSync(dirname(markerPath), { recursive: true });
const contents = repair
  ? `---\npurpose: Provide a non-sensitive orchestration pilot marker.\naudience: Orchestrator maintainers.\nauthoritative-for: Synthetic autonomous QA pilot evidence only.\nupdate-triggers: The orchestration pilot protocol changes.\nrelated-docs: autonomous-orchestration-pilot.md\n---\n\n# Pilot target\n\nStatus: repaired\n`
  : `---\npurpose: Provide a non-sensitive orchestration pilot marker.\naudience: Orchestrator maintainers.\nauthoritative-for: Synthetic autonomous QA pilot evidence only.\nupdate-triggers: The orchestration pilot protocol changes.\nrelated-docs: autonomous-orchestration-pilot.md\n---\n\n# Pilot target\n\nStatus: candidate\n`;
writeFileSync(markerPath, contents);
const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const handoff = {
  actor: 'codex',
  baseCommit,
  candidateCommit,
  commandsExecuted: [
    'write synthetic QA marker',
    'leave marker unstaged for supervisor validation',
  ],
  evidencePaths: ['docs/qa/pilot-target.md'],
  findings: repair
    ? [
        {
          evidencePaths: ['docs/qa/pilot-target.md'],
          id: 'QA-001',
          requirementId: 'PILOT-002',
          severity: 'medium',
          status: 'resolved',
          summary:
            'Synthetic marker now carries the independently required repaired status.',
        },
      ]
    : [],
  humanGateRequired: false,
  nextRequestedActor: 'claude',
  protocolVersion: '1.0.0',
  requirementsEvaluated: ['PILOT-001', 'PILOT-002'],
  runId,
  status: repair ? 'ready_for_retest' : 'ready_for_qa',
  testResults: [
    {
      command: 'synthetic marker write',
      durationMs: 0,
      status: 'passed',
    },
  ],
  workPackageId,
  ...(repair
    ? {
        resolutions: [
          {
            evidencePaths: ['docs/qa/pilot-target.md'],
            findingId: 'QA-001',
            status: 'resolved',
          },
        ],
      }
    : {}),
};
mkdirSync(dirname(handoffPath), { recursive: true });
writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, {
  mode: 0o600,
});
chmodSync(handoffPath, 0o600);
readFileSync(markerPath, 'utf8');
