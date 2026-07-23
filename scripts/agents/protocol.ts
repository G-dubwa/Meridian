import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HANDOFF_STATUSES,
  PROTOCOL_VERSION,
  RUN_STATES,
  type AcceptancePlanItem,
  type Finding,
  type HandoffBase,
  type OrchestratorConfig,
  type RepairResolution,
  type RunRecord,
  type TestResult,
  type WorkPackageDefinition,
} from './types.js';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} must be a finite number.`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new Error(`${label} must be an array of strings.`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0)
    throw new Error(
      `${label} contains unexpected fields: ${unexpected.join(', ')}`,
    );
}

function commit(
  value: unknown,
  label: string,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  const parsed = string(value, label);
  if (!/^[0-9a-f]{40}$/u.test(parsed))
    throw new Error(`${label} must be a full lowercase commit hash.`);
  return parsed;
}

function findings(value: unknown): readonly Finding[] {
  if (!Array.isArray(value)) throw new Error('findings must be an array.');
  return value.map((raw, index) => {
    const label = `findings[${String(index)}]`;
    const item = object(raw, label);
    exactKeys(
      item,
      ['id', 'requirementId', 'severity', 'summary', 'status', 'evidencePaths'],
      label,
    );
    const severity = string(item.severity, `${label}.severity`);
    const status = string(item.status, `${label}.status`);
    if (!['low', 'medium', 'high', 'critical'].includes(severity))
      throw new Error('Finding severity is invalid.');
    if (!['open', 'resolved', 'accepted'].includes(status))
      throw new Error('Finding status is invalid.');
    return {
      evidencePaths: stringArray(item.evidencePaths, `${label}.evidencePaths`),
      id: string(item.id, `${label}.id`),
      requirementId: string(item.requirementId, `${label}.requirementId`),
      severity: severity as Finding['severity'],
      status: status as Finding['status'],
      summary: string(item.summary, `${label}.summary`),
    };
  });
}

function testResults(value: unknown): readonly TestResult[] {
  if (!Array.isArray(value)) throw new Error('testResults must be an array.');
  return value.map((raw, index) => {
    const label = `testResults[${String(index)}]`;
    const item = object(raw, label);
    exactKeys(item, ['command', 'status', 'durationMs'], label);
    const status = string(item.status, `${label}.status`);
    if (!['passed', 'failed', 'not_run'].includes(status))
      throw new Error('Test result status is invalid.');
    return {
      command: string(item.command, `${label}.command`),
      durationMs: number(item.durationMs, `${label}.durationMs`),
      status: status as TestResult['status'],
    };
  });
}

const handoffKeys = [
  'protocolVersion',
  'runId',
  'workPackageId',
  'baseCommit',
  'candidateCommit',
  'actor',
  'status',
  'requirementsEvaluated',
  'findings',
  'evidencePaths',
  'commandsExecuted',
  'testResults',
  'nextRequestedActor',
  'humanGateRequired',
] as const;

export function parseHandoff(
  raw: unknown,
  expected: {
    readonly actor: 'codex' | 'claude';
    readonly run: RunRecord;
    readonly repair: boolean;
  },
): HandoffBase & {
  readonly acceptancePlan?: readonly AcceptancePlanItem[];
  readonly resolutions?: readonly RepairResolution[];
} {
  const value = object(raw, 'handoff');
  const extension =
    expected.actor === 'claude'
      ? 'acceptancePlan'
      : expected.repair
        ? 'resolutions'
        : null;
  exactKeys(
    value,
    extension ? [...handoffKeys, extension] : handoffKeys,
    'handoff',
  );
  if (value.protocolVersion !== PROTOCOL_VERSION)
    throw new Error('Handoff protocol version is unsupported.');
  if (value.runId !== expected.run.runId)
    throw new Error('Handoff run ID is stale or mismatched.');
  if (value.workPackageId !== expected.run.workPackageId)
    throw new Error('Handoff work-package ID is stale or mismatched.');
  if (value.baseCommit !== expected.run.baseCommit)
    throw new Error('Handoff base commit is stale or mismatched.');
  if (value.actor !== expected.actor)
    throw new Error('Handoff actor is invalid.');
  const status = string(value.status, 'handoff.status');
  if (!HANDOFF_STATUSES.includes(status as (typeof HANDOFF_STATUSES)[number]))
    throw new Error('Handoff status is invalid.');
  const next = string(value.nextRequestedActor, 'handoff.nextRequestedActor');
  if (!['supervisor', 'codex', 'claude', 'human', 'none'].includes(next))
    throw new Error('Handoff next actor is invalid.');
  const baseCommit = commit(value.baseCommit, 'handoff.baseCommit');
  if (baseCommit === null)
    throw new Error('Handoff base commit cannot be null.');
  const base: HandoffBase = {
    actor: expected.actor,
    baseCommit,
    candidateCommit: commit(
      value.candidateCommit,
      'handoff.candidateCommit',
      true,
    ),
    commandsExecuted: stringArray(
      value.commandsExecuted,
      'handoff.commandsExecuted',
    ),
    evidencePaths: stringArray(value.evidencePaths, 'handoff.evidencePaths'),
    findings: findings(value.findings),
    humanGateRequired: boolean(
      value.humanGateRequired,
      'handoff.humanGateRequired',
    ),
    nextRequestedActor: next as HandoffBase['nextRequestedActor'],
    protocolVersion: PROTOCOL_VERSION,
    requirementsEvaluated: stringArray(
      value.requirementsEvaluated,
      'handoff.requirementsEvaluated',
    ),
    runId: string(value.runId, 'handoff.runId'),
    status: status as HandoffBase['status'],
    testResults: testResults(value.testResults),
    workPackageId: string(value.workPackageId, 'handoff.workPackageId'),
  };
  if (
    expected.actor === 'claude' &&
    base.candidateCommit !== expected.run.candidateCommit
  )
    throw new Error('Claude handoff candidate commit is stale or mismatched.');
  if (expected.actor === 'claude') {
    if (!Array.isArray(value.acceptancePlan))
      throw new Error('Claude handoff requires an acceptance plan.');
    const acceptancePlan = value.acceptancePlan.map((rawItem, index) => {
      const label = `acceptancePlan[${String(index)}]`;
      const item = object(rawItem, label);
      exactKeys(
        item,
        [
          'requirementId',
          'observableBehaviour',
          'scenario',
          'expectedResult',
          'evidence',
        ],
        label,
      );
      return {
        evidence: stringArray(item.evidence, `${label}.evidence`),
        expectedResult: string(item.expectedResult, `${label}.expectedResult`),
        observableBehaviour: string(
          item.observableBehaviour,
          `${label}.observableBehaviour`,
        ),
        requirementId: string(item.requirementId, `${label}.requirementId`),
        scenario: string(item.scenario, `${label}.scenario`),
      };
    });
    return { ...base, acceptancePlan };
  }
  if (expected.repair) {
    if (!Array.isArray(value.resolutions))
      throw new Error('Repair handoff requires resolutions.');
    const resolutions = value.resolutions.map((rawItem, index) => {
      const label = `resolutions[${String(index)}]`;
      const item = object(rawItem, label);
      exactKeys(item, ['findingId', 'status', 'evidencePaths'], label);
      const resolutionStatus = string(item.status, `${label}.status`);
      if (!['resolved', 'disputed', 'blocked'].includes(resolutionStatus))
        throw new Error('Repair resolution status is invalid.');
      return {
        evidencePaths: stringArray(
          item.evidencePaths,
          `${label}.evidencePaths`,
        ),
        findingId: string(item.findingId, `${label}.findingId`),
        status: resolutionStatus as RepairResolution['status'],
      };
    });
    return { ...base, resolutions };
  }
  return base;
}

export function loadConfig(root: string): OrchestratorConfig {
  const value = object(
    JSON.parse(
      readFileSync(resolve(root, 'agents/orchestrator.config.json'), 'utf8'),
    ) as unknown,
    'orchestrator config',
  );
  exactKeys(
    value,
    [
      'protocolVersion',
      'worktreeRoot',
      'runRoot',
      'lockRoot',
      'maxRepairCycles',
      'staleAfterMinutes',
      'agentTimeoutMinutes',
      'infrastructureRetries',
      'paidModelAllowanceUsd',
      'automaticMerge',
      'pushBranches',
      'openPullRequest',
      'qaWritablePaths',
      'forbiddenReadPatterns',
      'mandatoryGateClasses',
      'preflightCommands',
      'finalVerificationCommands',
    ],
    'orchestrator config',
  );
  if (value.protocolVersion !== PROTOCOL_VERSION)
    throw new Error('Orchestrator config protocol version is unsupported.');
  const parsed: OrchestratorConfig = {
    agentTimeoutMinutes: number(
      value.agentTimeoutMinutes,
      'config.agentTimeoutMinutes',
    ),
    automaticMerge: boolean(value.automaticMerge, 'config.automaticMerge'),
    finalVerificationCommands: stringArray(
      value.finalVerificationCommands,
      'config.finalVerificationCommands',
    ),
    forbiddenReadPatterns: stringArray(
      value.forbiddenReadPatterns,
      'config.forbiddenReadPatterns',
    ),
    infrastructureRetries: number(
      value.infrastructureRetries,
      'config.infrastructureRetries',
    ),
    lockRoot: string(value.lockRoot, 'config.lockRoot'),
    mandatoryGateClasses: stringArray(
      value.mandatoryGateClasses,
      'config.mandatoryGateClasses',
    ),
    maxRepairCycles: number(value.maxRepairCycles, 'config.maxRepairCycles'),
    openPullRequest: boolean(value.openPullRequest, 'config.openPullRequest'),
    paidModelAllowanceUsd: number(
      value.paidModelAllowanceUsd,
      'config.paidModelAllowanceUsd',
    ),
    preflightCommands: stringArray(
      value.preflightCommands,
      'config.preflightCommands',
    ),
    protocolVersion: PROTOCOL_VERSION,
    pushBranches: boolean(value.pushBranches, 'config.pushBranches'),
    qaWritablePaths: stringArray(
      value.qaWritablePaths,
      'config.qaWritablePaths',
    ),
    runRoot: string(value.runRoot, 'config.runRoot'),
    staleAfterMinutes: number(
      value.staleAfterMinutes,
      'config.staleAfterMinutes',
    ),
    worktreeRoot: string(value.worktreeRoot, 'config.worktreeRoot'),
  };
  if (
    !Number.isInteger(parsed.maxRepairCycles) ||
    parsed.maxRepairCycles < 0 ||
    !Number.isInteger(parsed.infrastructureRetries) ||
    parsed.infrastructureRetries < 0 ||
    parsed.agentTimeoutMinutes <= 0 ||
    parsed.staleAfterMinutes <= 0 ||
    parsed.paidModelAllowanceUsd < 0
  )
    throw new Error('Orchestrator numeric limits are invalid.');
  return parsed;
}

export function loadWorkPackage(
  root: string,
  workPackageId: string,
): WorkPackageDefinition {
  if (!/^[A-Z0-9-]{3,40}$/u.test(workPackageId))
    throw new Error('Work-package ID is invalid.');
  const value = object(
    JSON.parse(
      readFileSync(
        resolve(root, 'agents/work-packages', `${workPackageId}.json`),
        'utf8',
      ),
    ) as unknown,
    'work-package definition',
  );
  exactKeys(
    value,
    [
      'protocolVersion',
      'workPackageId',
      'title',
      'specificationPaths',
      'allowedImplementationPaths',
      'requirements',
      'externalProviderAccess',
      'personalDataAllowed',
      'automaticMergeAllowed',
      'mandatoryGateClasses',
      'pilotOnly',
    ],
    'work-package definition',
  );
  if (value.protocolVersion !== PROTOCOL_VERSION)
    throw new Error('Work-package protocol version is unsupported.');
  if (value.workPackageId !== workPackageId)
    throw new Error('Work-package file identity does not match its request.');
  const requirements = value.requirements;
  if (!Array.isArray(requirements) || requirements.length === 0)
    throw new Error('Work package requires at least one requirement.');
  const parsedRequirements = requirements.map((raw, index) => {
    const label = `requirements[${String(index)}]`;
    const item = object(raw, label);
    exactKeys(item, ['id', 'text'], label);
    return {
      id: string(item.id, `${label}.id`),
      text: string(item.text, `${label}.text`),
    };
  });
  return {
    allowedImplementationPaths: stringArray(
      value.allowedImplementationPaths,
      'workPackage.allowedImplementationPaths',
    ),
    automaticMergeAllowed: boolean(
      value.automaticMergeAllowed,
      'workPackage.automaticMergeAllowed',
    ),
    externalProviderAccess: boolean(
      value.externalProviderAccess,
      'workPackage.externalProviderAccess',
    ),
    mandatoryGateClasses: stringArray(
      value.mandatoryGateClasses,
      'workPackage.mandatoryGateClasses',
    ),
    personalDataAllowed: boolean(
      value.personalDataAllowed,
      'workPackage.personalDataAllowed',
    ),
    pilotOnly: boolean(value.pilotOnly, 'workPackage.pilotOnly'),
    protocolVersion: PROTOCOL_VERSION,
    requirements: parsedRequirements,
    specificationPaths: stringArray(
      value.specificationPaths,
      'workPackage.specificationPaths',
    ),
    title: string(value.title, 'workPackage.title'),
    workPackageId,
  };
}

export function parseRunRecord(raw: unknown): RunRecord {
  const value = object(raw, 'run record');
  exactKeys(
    value,
    [
      'protocolVersion',
      'runId',
      'workPackageId',
      'authorizedCostCeilingUsd',
      'baseCommit',
      'branchName',
      'qaBranchName',
      'state',
      'candidateCommit',
      'qaCommit',
      'repairCycles',
      'createdAt',
      'estimatedCostUsd',
      'updatedAt',
      'activeChildPid',
      'stopRequested',
      'pilotMode',
      'simulatedAgents',
      'lastErrorCode',
      'latestCodexHandoff',
      'latestClaudeHandoff',
    ],
    'run record',
  );
  if (value.protocolVersion !== PROTOCOL_VERSION)
    throw new Error('Run protocol version is unsupported.');
  if (!RUN_STATES.includes(value.state as RunRecord['state']))
    throw new Error('Run state is invalid.');
  const activeChildPid = value.activeChildPid;
  if (
    activeChildPid !== null &&
    (typeof activeChildPid !== 'number' ||
      !Number.isInteger(activeChildPid) ||
      activeChildPid <= 0)
  )
    throw new Error('Run active child PID is invalid.');
  const nullableText = (rawValue: unknown, label: string): string | null => {
    if (rawValue === null) return null;
    return string(rawValue, label);
  };
  const repairCycles = number(value.repairCycles, 'run.repairCycles');
  if (!Number.isInteger(repairCycles) || repairCycles < 0)
    throw new Error('Run repair cycles are invalid.');
  const baseCommit = commit(value.baseCommit, 'run.baseCommit');
  if (baseCommit === null) throw new Error('Run base commit cannot be null.');
  const runId = string(value.runId, 'run.runId');
  const workPackageId = string(value.workPackageId, 'run.workPackageId');
  const authorizedCostCeilingUsd = number(
    value.authorizedCostCeilingUsd ?? 0,
    'run.authorizedCostCeilingUsd',
  );
  const estimatedCostUsd = number(
    value.estimatedCostUsd ?? 0,
    'run.estimatedCostUsd',
  );
  if (
    authorizedCostCeilingUsd < 0 ||
    estimatedCostUsd < 0 ||
    estimatedCostUsd > authorizedCostCeilingUsd
  )
    throw new Error('Run cost accounting is invalid.');
  return {
    activeChildPid,
    authorizedCostCeilingUsd,
    baseCommit,
    branchName: string(value.branchName, 'run.branchName'),
    candidateCommit: commit(value.candidateCommit, 'run.candidateCommit', true),
    createdAt: string(value.createdAt, 'run.createdAt'),
    estimatedCostUsd,
    lastErrorCode: nullableText(value.lastErrorCode, 'run.lastErrorCode'),
    latestClaudeHandoff: nullableText(
      value.latestClaudeHandoff,
      'run.latestClaudeHandoff',
    ),
    latestCodexHandoff: nullableText(
      value.latestCodexHandoff,
      'run.latestCodexHandoff',
    ),
    pilotMode: boolean(value.pilotMode, 'run.pilotMode'),
    protocolVersion: PROTOCOL_VERSION,
    qaBranchName:
      typeof value.qaBranchName === 'string' && value.qaBranchName.length > 0
        ? value.qaBranchName
        : `qa/${workPackageId.toLowerCase()}-${runId.slice(-8)}-legacy`,
    qaCommit: commit(value.qaCommit ?? null, 'run.qaCommit', true),
    repairCycles,
    runId,
    simulatedAgents: boolean(value.simulatedAgents, 'run.simulatedAgents'),
    state: value.state as RunRecord['state'],
    stopRequested: boolean(value.stopRequested, 'run.stopRequested'),
    updatedAt: string(value.updatedAt, 'run.updatedAt'),
    workPackageId,
  };
}
