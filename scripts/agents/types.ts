export const PROTOCOL_VERSION = '1.0.0' as const;

export const RUN_STATES = [
  'PREPARE',
  'CODEX_BUILD',
  'DETERMINISTIC_PREFLIGHT',
  'CLAUDE_AUDIT',
  'CODEX_REPAIR',
  'CLAUDE_RETEST',
  'FINAL_VERIFICATION',
  'READY_TO_MERGE',
  'HUMAN_GATE',
  'FAILED',
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const HANDOFF_STATUSES = [
  'ready_for_qa',
  'changes_requested',
  'ready_for_retest',
  'approved',
  'blocked',
  'human_gate_required',
  'failed',
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export type Actor = 'supervisor' | 'codex' | 'claude';
export type NextActor = 'supervisor' | 'codex' | 'claude' | 'human' | 'none';

export interface Finding {
  readonly id: string;
  readonly requirementId: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly summary: string;
  readonly status: 'open' | 'resolved' | 'accepted';
  readonly evidencePaths: readonly string[];
}

export interface TestResult {
  readonly command: string;
  readonly status: 'passed' | 'failed' | 'not_run';
  readonly durationMs: number;
}

export interface HandoffBase {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly runId: string;
  readonly workPackageId: string;
  readonly baseCommit: string;
  readonly candidateCommit: string | null;
  readonly actor: Actor;
  readonly status: HandoffStatus;
  readonly requirementsEvaluated: readonly string[];
  readonly findings: readonly Finding[];
  readonly evidencePaths: readonly string[];
  readonly commandsExecuted: readonly string[];
  readonly testResults: readonly TestResult[];
  readonly nextRequestedActor: NextActor;
  readonly humanGateRequired: boolean;
}

export interface AcceptancePlanItem {
  readonly requirementId: string;
  readonly observableBehaviour: string;
  readonly scenario: string;
  readonly expectedResult: string;
  readonly evidence: readonly string[];
}

export interface ClaudeQaResult extends HandoffBase {
  readonly actor: 'claude';
  readonly acceptancePlan: readonly AcceptancePlanItem[];
}

export interface RepairResolution {
  readonly findingId: string;
  readonly status: 'resolved' | 'disputed' | 'blocked';
  readonly evidencePaths: readonly string[];
}

export interface RepairResponse extends HandoffBase {
  readonly actor: 'codex';
  readonly resolutions: readonly RepairResolution[];
}

export interface Requirement {
  readonly id: string;
  readonly text: string;
}

export interface WorkPackageDefinition {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly workPackageId: string;
  readonly title: string;
  readonly specificationPaths: readonly string[];
  readonly allowedImplementationPaths: readonly string[];
  readonly requirements: readonly Requirement[];
  readonly externalProviderAccess: boolean;
  readonly personalDataAllowed: boolean;
  readonly automaticMergeAllowed: boolean;
  readonly mandatoryGateClasses: readonly string[];
  readonly pilotOnly: boolean;
}

export interface OrchestratorConfig {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly worktreeRoot: string;
  readonly runRoot: string;
  readonly lockRoot: string;
  readonly maxRepairCycles: number;
  readonly staleAfterMinutes: number;
  readonly agentTimeoutMinutes: number;
  readonly infrastructureRetries: number;
  readonly paidModelAllowanceUsd: number;
  readonly automaticMerge: boolean;
  readonly pushBranches: boolean;
  readonly openPullRequest: boolean;
  readonly qaWritablePaths: readonly string[];
  readonly forbiddenReadPatterns: readonly string[];
  readonly mandatoryGateClasses: readonly string[];
  readonly preflightCommands: readonly string[];
  readonly finalVerificationCommands: readonly string[];
}

export interface TransitionRecord {
  readonly sequence: number;
  readonly at: string;
  readonly from: RunState | null;
  readonly to: RunState;
  readonly reasonCode: string;
  readonly actor: 'supervisor';
  readonly candidateCommit: string | null;
  readonly durationMs: number | null;
  readonly cost: {
    readonly currency: 'USD';
    readonly amount: number | null;
    readonly source: 'not_reported' | 'agent_metadata';
  };
}

export interface RunRecord {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly runId: string;
  readonly workPackageId: string;
  readonly baseCommit: string;
  readonly branchName: string;
  readonly qaBranchName: string;
  readonly state: RunState;
  readonly candidateCommit: string | null;
  readonly qaCommit: string | null;
  readonly repairCycles: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeChildPid: number | null;
  readonly stopRequested: boolean;
  readonly pilotMode: boolean;
  readonly simulatedAgents: boolean;
  readonly lastErrorCode: string | null;
  readonly latestCodexHandoff: string | null;
  readonly latestClaudeHandoff: string | null;
}

export interface CommandResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly spawnFailed: boolean;
}
