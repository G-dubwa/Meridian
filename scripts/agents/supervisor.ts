import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertClean,
  changedPaths,
  commitValidatedWorkingTree,
  createWorktrees,
  exactHead,
  fastForwardBuilder,
  isAncestor,
  materializeAuditorCommit,
  pushExactBranch,
  recordQaBranch,
  removeAgentWorktrees,
  resolveCommit,
  workingTreePaths,
} from './git.js';
import { loadConfig, loadWorkPackage, parseHandoff } from './protocol.js';
import { runCommand, stopProcessTree } from './process-runner.js';
import {
  assertNoSensitiveText,
  assertPathsAllowed,
  assertPrivateArtifact,
  assertSafeRelativePath,
  safeChildEnvironment,
  scanSensitiveText,
} from './security.js';
import {
  acquireRunLock,
  appendTransition,
  handoffPath,
  loadRun,
  runDirectory,
  saveRun,
  transitionCount,
} from './state.js';
import {
  PROTOCOL_VERSION,
  type CommandResult,
  type OrchestratorConfig,
  type RunRecord,
  type RunState,
  type TestResult,
  type WorkPackageDefinition,
} from './types.js';

export interface DoctorCheck {
  readonly name: string;
  readonly status: 'passed' | 'failed';
  readonly detail: string;
}

export interface DoctorReport {
  readonly ready: boolean;
  readonly checks: readonly DoctorCheck[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function shellTokens(command: string): readonly string[] {
  if (/[;&|`$><\n\r]/u.test(command))
    throw new Error(
      `Shell operators are forbidden in governed commands: ${command}`,
    );
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  return tokens.map((token) => token.replace(/^(["'])|(["'])$/gu, ''));
}

function commandResult(result: CommandResult): TestResult {
  return {
    command: [result.command, ...result.args].join(' '),
    durationMs: result.durationMs,
    status: result.exitCode === 0 ? 'passed' : 'failed',
  };
}

function invocationFailureClass(result: CommandResult): string {
  if (result.spawnFailed) return 'spawn_failed';
  if (result.timedOut) return 'timeout';
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  if (/schema|\$ref|structured.output/iu.test(diagnostic))
    return 'structured_output_schema';
  if (/auth|login|credential|unauthorized|forbidden/iu.test(diagnostic))
    return 'agent_authentication';
  if (/quota|rate.limit|credit|billing/iu.test(diagnostic))
    return 'agent_quota';
  if (/network|connect|dns|socket|timed.out/iu.test(diagnostic))
    return 'agent_network';
  if (/permission|operation not permitted|access denied/iu.test(diagnostic))
    return 'agent_permission';
  return 'nonzero_exit';
}

function handoffJson(path: string): unknown {
  assertPrivateArtifact(path);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function inlineCommonSchemaReferences(
  root: string,
  schemaPath: string,
): string {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
  const common = JSON.parse(
    readFileSync(resolve(root, 'schemas/agents/v1/common.schema.json'), 'utf8'),
  ) as {
    readonly $defs?: Readonly<Record<string, unknown>>;
  };
  const definitions = common.$defs ?? {};
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const reference = record.$ref;
    if (typeof reference === 'string') {
      const match = /^common\.schema\.json#\/\$defs\/([A-Za-z0-9_-]+)$/u.exec(
        reference,
      );
      if (match) {
        const definition = definitions[match[1] ?? ''];
        if (!definition)
          throw new Error('Agent schema references an unknown common type.');
        return visit(definition);
      }
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, visit(item)]),
    );
  };
  const normalizeForCli = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value;
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    if (record.type !== undefined) normalized.type = record.type;
    if (record.const !== undefined) {
      normalized.enum = [record.const];
      if (normalized.type === undefined) {
        if (typeof record.const === 'string') normalized.type = 'string';
        else if (typeof record.const === 'boolean') normalized.type = 'boolean';
        else if (typeof record.const === 'number') normalized.type = 'number';
      }
    } else if (record.enum !== undefined) {
      normalized.enum = record.enum;
      if (
        normalized.type === undefined &&
        Array.isArray(record.enum) &&
        record.enum.length > 0
      ) {
        if (record.enum.every((item) => typeof item === 'string'))
          normalized.type = 'string';
        else if (record.enum.every((item) => typeof item === 'boolean'))
          normalized.type = 'boolean';
        else if (record.enum.every((item) => typeof item === 'number'))
          normalized.type = 'number';
      }
    }
    if (record.properties && typeof record.properties === 'object') {
      normalized.properties = Object.fromEntries(
        Object.entries(record.properties as Record<string, unknown>).map(
          ([key, item]) => [key, normalizeForCli(item)],
        ),
      );
    }
    if (record.required !== undefined) normalized.required = record.required;
    if (record.additionalProperties !== undefined)
      normalized.additionalProperties = record.additionalProperties;
    if (record.items !== undefined)
      normalized.items = normalizeForCli(record.items);
    return normalized;
  };
  return `${JSON.stringify(normalizeForCli(visit(schema)), null, 2)}\n`;
}

function updateRun(
  root: string,
  config: OrchestratorConfig,
  run: RunRecord,
  patch: Partial<RunRecord>,
): RunRecord {
  const next: RunRecord = {
    ...run,
    ...patch,
    updatedAt: nowIso(),
  };
  saveRun(root, config.runRoot, next);
  return next;
}

function transition(
  root: string,
  config: OrchestratorConfig,
  run: RunRecord,
  to: RunState,
  reasonCode: string,
  durationMs: number | null = null,
): RunRecord {
  appendTransition(root, config.runRoot, run.runId, {
    actor: 'supervisor',
    at: nowIso(),
    candidateCommit: run.candidateCommit,
    cost: {
      amount: null,
      currency: 'USD',
      source: 'not_reported',
    },
    durationMs,
    from: run.state,
    reasonCode,
    sequence: transitionCount(root, config.runRoot, run.runId) + 1,
    to,
  });
  return updateRun(root, config, run, { state: to });
}

function agentPrompt(input: {
  readonly actor: 'codex' | 'claude';
  readonly run: RunRecord;
  readonly workPackage: WorkPackageDefinition;
  readonly handoffPath: string;
  readonly repairFindingsPath?: string;
}): string {
  const shared = [
    `Protocol version: ${PROTOCOL_VERSION}`,
    `Run ID: ${input.run.runId}`,
    `Work package: ${input.run.workPackageId}`,
    `Base commit: ${input.run.baseCommit}`,
    `Return only the required structured JSON handoff; the supervisor captures it at: ${input.handoffPath}`,
    'Do not use repository tools to write directly to the supervisor handoff path.',
    'Do not read .env, .env.local, credentials, provider tokens, or personal data.',
    'Do not contact external providers. Do not emit secrets or unstructured final prose.',
  ];
  if (input.actor === 'codex')
    return [
      ...shared,
      'You are the implementation agent. Work only in the current builder worktree.',
      `Allowed implementation paths: ${input.workPackage.allowedImplementationPaths.join(', ')}`,
      `Authoritative specifications: ${input.workPackage.specificationPaths.join(', ')}`,
      `Requirements: ${input.workPackage.requirements.map((item) => `${item.id}: ${item.text}`).join(' | ')}`,
      input.repairFindingsPath
        ? `Resolve only the structured findings in ${input.repairFindingsPath}; provide finding-by-finding resolutions.`
        : 'Create one package-sized working-tree change for the supervisor to commit after deterministic path validation.',
      'Do not stage or commit changes and do not write Git metadata. Report the exact current HEAD as candidateCommit; the supervisor owns the commit boundary.',
      'The supervisor owns the complete repository check. For this synthetic package, run only focused checks needed to validate your allowed-path change.',
    ].join('\n');
  return [
    ...shared,
    'You are the independent black-box QA agent.',
    'First derive an acceptance plan from authoritative product, domain, security, and work-package documents before inspecting implementation tests.',
    'Map requirement ID to observable behaviour, scenario, expected result, and evidence.',
    'Prefer browser and public API behaviour. Do not import application services to calculate expected outputs.',
    'Do not repair production code. Any repository edit is restricted to the configured QA paths.',
    'If you create or update allowed QA files, leave them unstaged. The supervisor validates their paths and creates a separate QA commit; never amend, rebase, squash, or rewrite the candidate.',
    `Authoritative specifications: ${input.workPackage.specificationPaths.join(', ')}`,
    `Requirements: ${input.workPackage.requirements.map((item) => `${item.id}: ${item.text}`).join(' | ')}`,
    `Candidate commit: ${input.run.candidateCommit ?? 'missing'}`,
  ].join('\n');
}

export class Supervisor {
  private readonly config: OrchestratorConfig;

  public constructor(private readonly root: string) {
    this.config = loadConfig(root);
  }

  public async doctor(): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];
    for (const [name, command] of [
      ['git', 'git'],
      ['codex', 'codex'],
      ['claude', 'claude'],
      ['node', process.execPath],
    ] as const) {
      const result = await runCommand({
        args: ['--version'],
        command,
        cwd: this.root,
        environment: safeChildEnvironment({}),
        timeoutMs: 10_000,
      });
      checks.push({
        detail:
          result.exitCode === 0
            ? ((result.stdout || result.stderr).trim().split('\n')[0] ??
              'available')
            : name === 'claude'
              ? 'Claude Code is absent. Install the official Claude Code CLI, authenticate interactively, then rerun pnpm agents:doctor.'
              : `${name} is absent or unusable.`,
        name,
        status: result.exitCode === 0 ? 'passed' : 'failed',
      });
    }
    const base = await resolveCommit(this.root, 'origin/main').catch(
      () => null,
    );
    checks.push({
      detail: base
        ? `origin/main resolves to ${base}`
        : 'origin/main could not be resolved locally; fetch it before planning.',
      name: 'origin/main',
      status: base ? 'passed' : 'failed',
    });
    checks.push({
      detail:
        'Runtime child environments exclude API keys and set MERIDIAN_EXTERNAL_PROVIDER_NETWORK=deny.',
      name: 'provider-network-policy',
      status: 'passed',
    });
    return {
      checks,
      ready: checks.every((check) => check.status === 'passed'),
    };
  }

  public async plan(
    workPackageId: string,
    options: {
      readonly baseReference?: string;
      readonly costCeilingUsd?: number;
      readonly ownerConfirmedPaidPilot?: boolean;
      readonly pilotMode?: boolean;
    } = {},
  ): Promise<RunRecord> {
    const workPackage = loadWorkPackage(this.root, workPackageId);
    for (const path of [
      ...workPackage.specificationPaths,
      ...workPackage.allowedImplementationPaths,
    ])
      assertSafeRelativePath(this.root, path);
    const costCeilingUsd = options.costCeilingUsd ?? 0;
    if (!Number.isFinite(costCeilingUsd) || costCeilingUsd < 0)
      throw new Error('The run cost ceiling must be a non-negative USD value.');
    const paidGateRequired =
      costCeilingUsd > this.config.paidModelAllowanceUsd &&
      !options.ownerConfirmedPaidPilot;
    const mandatoryGateClass = paidGateRequired
      ? 'paid_model_above_allowance'
      : workPackage.externalProviderAccess
        ? 'live_provider_access'
        : workPackage.personalDataAllowed
          ? 'personal_data_transmission'
          : (workPackage.mandatoryGateClasses[0] ?? null);
    const baseCommit = await resolveCommit(
      this.root,
      options.baseReference ?? 'origin/main',
    );
    const runId = `${workPackageId.toLowerCase()}-${new Date()
      .toISOString()
      .replace(/\D/gu, '')
      .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const createdAt = nowIso();
    const run: RunRecord = {
      activeChildPid: null,
      authorizedCostCeilingUsd: costCeilingUsd,
      baseCommit,
      branchName: `agent/${workPackageId.toLowerCase()}-${runId.slice(-8)}`,
      candidateCommit: null,
      createdAt,
      estimatedCostUsd: 0,
      lastErrorCode: null,
      latestClaudeHandoff: null,
      latestCodexHandoff: null,
      pilotMode: options.pilotMode ?? false,
      protocolVersion: PROTOCOL_VERSION,
      qaBranchName: `qa/${workPackageId.toLowerCase()}-${runId.slice(-8)}`,
      qaCommit: null,
      repairCycles: 0,
      runId,
      simulatedAgents: options.pilotMode ?? false,
      state: 'PREPARE',
      stopRequested: false,
      updatedAt: createdAt,
      workPackageId,
    };
    saveRun(this.root, this.config.runRoot, run);
    appendTransition(this.root, this.config.runRoot, run.runId, {
      actor: 'supervisor',
      at: createdAt,
      candidateCommit: null,
      cost: { amount: null, currency: 'USD', source: 'not_reported' },
      durationMs: null,
      from: null,
      reasonCode: 'run_planned',
      sequence: 1,
      to: 'PREPARE',
    });
    const assignment = {
      actor: 'supervisor',
      allowedImplementationPaths: workPackage.allowedImplementationPaths,
      authorizedCostCeilingUsd: costCeilingUsd,
      baseCommit,
      candidateCommit: null,
      commandsExecuted: [],
      evidencePaths: workPackage.specificationPaths,
      findings: [],
      humanGateRequired: false,
      nextRequestedActor: 'codex',
      protocolVersion: PROTOCOL_VERSION,
      requirementsEvaluated: workPackage.requirements.map((item) => item.id),
      runId,
      specificationPaths: workPackage.specificationPaths,
      status: 'ready_for_qa',
      testResults: [],
      workPackageId,
    };
    const assignmentPath = handoffPath(
      this.root,
      this.config.runRoot,
      runId,
      'assignment.json',
    );
    writeFileSync(assignmentPath, `${JSON.stringify(assignment, null, 2)}\n`, {
      mode: 0o600,
    });
    if (mandatoryGateClass)
      return this.humanGate(
        run,
        mandatoryGateClass,
        `Approve the declared ${mandatoryGateClass} gate before agent invocation.`,
        'The committed work-package definition declares an operation that cannot proceed autonomously.',
      );
    return run;
  }

  public requestStop(runId: string): RunRecord {
    const run = loadRun(this.root, this.config.runRoot, runId);
    if (run.activeChildPid !== null) stopProcessTree(run.activeChildPid);
    return updateRun(this.root, this.config, run, { stopRequested: true });
  }

  private humanGate(
    run: RunRecord,
    gateClass: string,
    request: string,
    reason: string,
  ): RunRecord {
    const path = handoffPath(
      this.root,
      this.config.runRoot,
      run.runId,
      'human-gate.json',
    );
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          actor: 'supervisor',
          baseCommit: run.baseCommit,
          candidateCommit: run.candidateCommit,
          commandsExecuted: [],
          evidencePaths: [
            run.latestCodexHandoff,
            run.latestClaudeHandoff,
          ].filter(Boolean),
          findings: [],
          gateClass,
          humanGateRequired: true,
          nextRequestedActor: 'human',
          protocolVersion: PROTOCOL_VERSION,
          reason,
          request,
          requirementsEvaluated: [],
          runId: run.runId,
          status: 'human_gate_required',
          testResults: [],
          untouched: [
            'main branch and verified commits',
            'environment and credential files',
            'persistent owner database',
            'external providers and production services',
          ],
          workPackageId: run.workPackageId,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    return transition(this.root, this.config, run, 'HUMAN_GATE', gateClass);
  }

  private childPid(run: RunRecord, pid: number | null): void {
    const current = loadRun(this.root, this.config.runRoot, run.runId);
    saveRun(this.root, this.config.runRoot, {
      ...current,
      activeChildPid: pid,
      updatedAt: nowIso(),
    });
  }

  private accountInvocationCost(
    run: RunRecord,
    costUsd: number | null,
  ): RunRecord {
    if (costUsd === null) return run;
    const estimatedCostUsd = run.estimatedCostUsd + costUsd;
    if (estimatedCostUsd > run.authorizedCostCeilingUsd)
      throw new Error(
        'Cumulative agent cost exceeded the authorized run ceiling.',
      );
    return updateRun(this.root, this.config, run, { estimatedCostUsd });
  }

  private async invokeAgent(
    run: RunRecord,
    actor: 'codex' | 'claude',
    repair: boolean,
    workPackage: WorkPackageDefinition,
  ): Promise<{
    readonly costUsd: number | null;
    readonly handoff: ReturnType<typeof parseHandoff>;
    readonly result: CommandResult;
    readonly path: string;
  }> {
    const suffix =
      actor === 'claude'
        ? `${repair ? 'retest' : 'audit'}-${String(run.repairCycles)}.json`
        : `${repair ? 'repair' : 'build'}-${String(run.repairCycles)}.json`;
    const outputPath = handoffPath(
      this.root,
      this.config.runRoot,
      run.runId,
      suffix,
    );
    writeFileSync(outputPath, '', { mode: 0o600 });
    const findingsPath = run.latestClaudeHandoff ?? undefined;
    const prompt = agentPrompt({
      actor,
      handoffPath: outputPath,
      ...(repair && findingsPath ? { repairFindingsPath: findingsPath } : {}),
      run,
      workPackage,
    });
    assertNoSensitiveText(prompt, `${actor} prompt`);
    const worktree = resolve(
      this.root,
      this.config.worktreeRoot,
      actor === 'codex' ? 'codex-builder' : 'claude-auditor',
    );
    const schemaSource = resolve(
      this.root,
      'schemas/agents/v1',
      actor === 'claude'
        ? 'claude-qa-result.schema.json'
        : repair
          ? 'repair-response.schema.json'
          : 'codex-implementation-result.schema.json',
    );
    const schema = handoffPath(
      this.root,
      this.config.runRoot,
      run.runId,
      `schema-${actor}-${repair ? 'repair' : 'initial'}.json`,
    );
    writeFileSync(
      schema,
      inlineCommonSchemaReferences(this.root, schemaSource),
      { mode: 0o600 },
    );
    const fixture = resolve(
      this.root,
      'scripts/agents/fixtures',
      `${actor}.mjs`,
    );
    const expectedCommit =
      actor === 'claude'
        ? run.candidateCommit
        : repair
          ? run.candidateCommit
          : run.baseCommit;
    if (!expectedCommit)
      throw new Error(`${actor} invocation has no exact approved commit.`);
    await exactHead(worktree, expectedCommit);
    await assertClean(worktree);
    const command = run.pilotMode ? process.execPath : actor;
    const remainingBudgetUsd =
      run.authorizedCostCeilingUsd - run.estimatedCostUsd;
    if (!run.pilotMode && actor === 'claude' && remainingBudgetUsd <= 0)
      throw new Error(
        'Claude invocation refused because no authorized cost budget remains.',
      );
    const args = run.pilotMode
      ? [fixture]
      : actor === 'codex'
        ? [
            'exec',
            '--ephemeral',
            '--sandbox',
            'workspace-write',
            '--color',
            'never',
            '--output-schema',
            schema,
            '--output-last-message',
            outputPath,
            '--cd',
            worktree,
            prompt,
          ]
        : [
            '-p',
            prompt,
            '--output-format',
            'json',
            '--safe-mode',
            '--strict-mcp-config',
            '--mcp-config',
            '{}',
            '--no-session-persistence',
            '--max-budget-usd',
            remainingBudgetUsd.toFixed(6),
            '--json-schema',
            readFileSync(schema, 'utf8'),
            '--disallowedTools',
            'WebFetch,WebSearch,Bash(curl:*),Bash(wget:*),Bash(nc:*),Bash(ssh:*),Bash(gh:*)',
          ];
    const environment = safeChildEnvironment({
      MERIDIAN_AGENT_ACTOR: actor,
      MERIDIAN_AGENT_HANDOFF_PATH: outputPath,
      MERIDIAN_AGENT_REPAIR: repair ? 'true' : 'false',
      MERIDIAN_BASE_COMMIT: run.baseCommit,
      MERIDIAN_CANDIDATE_COMMIT: run.candidateCommit ?? '',
      MERIDIAN_RUN_ID: run.runId,
      MERIDIAN_WORK_PACKAGE_ID: run.workPackageId,
    });
    let result: CommandResult | null = null;
    for (
      let attempt = 0;
      attempt <= this.config.infrastructureRetries;
      attempt += 1
    ) {
      result = await runCommand({
        args,
        command,
        cwd: worktree,
        environment,
        onPid: (pid) => {
          this.childPid(run, pid);
        },
        timeoutMs: this.config.agentTimeoutMinutes * 60_000,
      });
      if (result.exitCode === 0 || (!result.spawnFailed && !result.timedOut))
        break;
    }
    if (result && result.exitCode !== 0) {
      const diagnosticPath = handoffPath(
        this.root,
        this.config.runRoot,
        run.runId,
        `diagnostic-${actor}-${repair ? 'repair' : 'initial'}.json`,
      );
      writeFileSync(
        diagnosticPath,
        `${JSON.stringify(
          {
            actor,
            exitCode: result.exitCode,
            failureClass: invocationFailureClass(result),
            signal: result.signal,
            spawnFailed: result.spawnFailed,
            stderrBytes: Buffer.byteLength(result.stderr),
            stdoutBytes: Buffer.byteLength(result.stdout),
            timedOut: result.timedOut,
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
    }
    if (result?.exitCode !== 0)
      throw new Error(
        result?.timedOut
          ? `${actor} invocation timed out.`
          : `${actor} invocation failed without a valid handoff.`,
      );
    assertNoSensitiveText(result.stdout, `${actor} stdout`);
    assertNoSensitiveText(result.stderr, `${actor} stderr`);
    let costUsd: number | null = null;
    let claudeResponse:
      | {
          readonly structured_output?: unknown;
          readonly total_cost_usd?: unknown;
        }
      | undefined;
    if (actor === 'claude' && !run.pilotMode) {
      claudeResponse = JSON.parse(result.stdout) as {
        readonly structured_output?: unknown;
        readonly total_cost_usd?: unknown;
      };
      const reportedCost = claudeResponse.total_cost_usd;
      if (
        typeof reportedCost !== 'number' ||
        !Number.isFinite(reportedCost) ||
        reportedCost < 0
      )
        throw new Error(
          'Claude response omitted valid content-free cost metadata.',
        );
      costUsd = reportedCost;
      if (costUsd > remainingBudgetUsd)
        throw new Error(
          'Claude reported cost above the authorized remaining ceiling.',
        );
    }
    if (
      actor === 'claude' &&
      readFileSync(outputPath, 'utf8').trim().length === 0
    ) {
      const response =
        claudeResponse ??
        (JSON.parse(result.stdout) as {
          readonly structured_output?: unknown;
        });
      if (response.structured_output === undefined)
        throw new Error('Claude response omitted structured_output.');
      writeFileSync(
        outputPath,
        `${JSON.stringify(response.structured_output, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    if (!existsSync(outputPath))
      throw new Error(`${actor} did not create its required handoff.`);
    const handoff = parseHandoff(handoffJson(outputPath), {
      actor,
      repair,
      run,
    });
    return { costUsd, handoff, path: outputPath, result };
  }

  private async deterministicChecks(
    run: RunRecord,
    commands: readonly string[],
  ): Promise<readonly TestResult[]> {
    const builder = resolve(
      this.root,
      this.config.worktreeRoot,
      'codex-builder',
    );
    const results: TestResult[] = [];
    for (const commandText of commands) {
      const tokens = shellTokens(commandText);
      const command = tokens[0];
      if (!command) throw new Error('Empty verification command.');
      const result = await runCommand({
        args: tokens.slice(1),
        command,
        cwd: builder,
        environment: safeChildEnvironment({}),
        onPid: (pid) => {
          this.childPid(run, pid);
        },
        timeoutMs: this.config.agentTimeoutMinutes * 60_000,
      });
      results.push(commandResult(result));
      assertNoSensitiveText(result.stdout, 'verification stdout');
      assertNoSensitiveText(result.stderr, 'verification stderr');
      if (result.exitCode !== 0)
        throw new Error(`Deterministic verification failed: ${commandText}`);
    }
    return results;
  }

  public async run(
    runId: string,
    options: { readonly pauseAt?: RunState } = {},
  ): Promise<RunRecord> {
    let run = loadRun(this.root, this.config.runRoot, runId);
    const release = acquireRunLock(
      this.root,
      this.config.lockRoot,
      run.workPackageId,
      this.config.staleAfterMinutes,
    );
    try {
      if (run.activeChildPid !== null) {
        if (processIsAlive(run.activeChildPid))
          throw new Error(
            'The persisted child process is still active; concurrent resume is refused.',
          );
        run = updateRun(this.root, this.config, run, {
          activeChildPid: null,
          lastErrorCode: 'STALE_CHILD_RECOVERED',
        });
      }
      const workPackage = loadWorkPackage(this.root, run.workPackageId);
      while (!['READY_TO_MERGE', 'HUMAN_GATE', 'FAILED'].includes(run.state)) {
        run = loadRun(this.root, this.config.runRoot, run.runId);
        if (run.stopRequested)
          throw new Error('Run stop was requested by the operator.');
        if (options.pauseAt === run.state) return run;
        if (
          Date.now() - Date.parse(run.updatedAt) >
            this.config.staleAfterMinutes * 60_000 &&
          run.activeChildPid !== null
        )
          throw new Error('Run is stale while retaining an active child PID.');
        switch (run.state) {
          case 'PREPARE': {
            await exactHead(this.root, await resolveCommit(this.root, 'HEAD'));
            await createWorktrees({
              baseCommit: run.baseCommit,
              branchName: run.branchName,
              controlRoot: this.root,
              worktreeRoot: this.config.worktreeRoot,
            });
            run = transition(
              this.root,
              this.config,
              run,
              'CODEX_BUILD',
              'worktrees_prepared',
            );
            break;
          }
          case 'CODEX_BUILD': {
            const invocation = await this.invokeAgent(
              run,
              'codex',
              false,
              workPackage,
            );
            run = this.accountInvocationCost(run, invocation.costUsd);
            if (invocation.handoff.humanGateRequired) {
              run = this.humanGate(
                run,
                'agent_requested_human_gate',
                'Review the implementation-agent gate request.',
                'The implementation agent reported that autonomous work cannot safely continue.',
              );
              break;
            }
            if (invocation.handoff.status !== 'ready_for_qa')
              throw new Error('Codex did not return ready_for_qa.');
            let candidateCommit = invocation.handoff.candidateCommit;
            if (!candidateCommit)
              throw new Error('Codex handoff omitted its candidate commit.');
            const builder = resolve(
              this.root,
              this.config.worktreeRoot,
              'codex-builder',
            );
            const builderHead = await resolveCommit(builder, 'HEAD');
            const builderChanges = await workingTreePaths(builder);
            if (builderChanges.length > 0) {
              if (
                builderHead !== run.baseCommit ||
                candidateCommit !== builderHead
              )
                throw new Error(
                  'Uncommitted Codex output is not based on the exact approved commit.',
                );
              assertPathsAllowed(
                builder,
                builderChanges,
                workPackage.allowedImplementationPaths,
              );
              candidateCommit = await commitValidatedWorkingTree(
                builder,
                `${run.workPackageId}: supervised implementation`,
              );
            } else {
              await exactHead(builder, candidateCommit);
              await assertClean(builder);
            }
            if (candidateCommit === run.baseCommit)
              throw new Error('Codex produced no candidate change.');
            if (!(await isAncestor(builder, run.baseCommit, candidateCommit)))
              throw new Error(
                'Candidate does not descend from the approved base.',
              );
            assertPathsAllowed(
              builder,
              await changedPaths(builder, run.baseCommit, candidateCommit),
              workPackage.allowedImplementationPaths,
            );
            run = updateRun(this.root, this.config, run, {
              candidateCommit,
              latestCodexHandoff: invocation.path,
            });
            run = transition(
              this.root,
              this.config,
              run,
              'DETERMINISTIC_PREFLIGHT',
              'codex_candidate_validated',
              invocation.result.durationMs,
            );
            break;
          }
          case 'DETERMINISTIC_PREFLIGHT': {
            const commands = run.pilotMode
              ? [
                  `${process.execPath} ${resolve(
                    this.root,
                    'scripts/agents/fixtures/pilot-check.mjs',
                  )}`,
                ]
              : this.config.preflightCommands;
            await this.deterministicChecks(run, commands);
            run = transition(
              this.root,
              this.config,
              run,
              'CLAUDE_AUDIT',
              'preflight_passed',
            );
            break;
          }
          case 'CLAUDE_AUDIT':
          case 'CLAUDE_RETEST': {
            if (!run.candidateCommit)
              throw new Error('Claude cannot audit a missing candidate.');
            const candidateCommit = run.candidateCommit;
            const auditor = resolve(
              this.root,
              this.config.worktreeRoot,
              'claude-auditor',
            );
            await materializeAuditorCommit(auditor, candidateCommit);
            const invocation = await this.invokeAgent(
              run,
              'claude',
              run.state === 'CLAUDE_RETEST',
              workPackage,
            );
            run = this.accountInvocationCost(run, invocation.costUsd);
            const qaChanges = await workingTreePaths(auditor);
            assertPathsAllowed(auditor, qaChanges, this.config.qaWritablePaths);
            let auditedCommit = await resolveCommit(auditor, 'HEAD');
            if (qaChanges.length > 0) {
              if (auditedCommit !== candidateCommit)
                throw new Error(
                  'Uncommitted QA output is not based on the exact audited candidate.',
                );
              auditedCommit = await commitValidatedWorkingTree(
                auditor,
                `${run.workPackageId}: supervised independent QA evidence`,
              );
            } else await assertClean(auditor);
            let qaCommit = run.qaCommit;
            if (auditedCommit !== candidateCommit) {
              if (!(await isAncestor(auditor, candidateCommit, auditedCommit)))
                throw new Error(
                  'QA commit does not descend from the exact audited candidate.',
                );
              assertPathsAllowed(
                auditor,
                await changedPaths(auditor, candidateCommit, auditedCommit),
                this.config.qaWritablePaths,
              );
              await recordQaBranch(this.root, run.qaBranchName, auditedCommit);
              const builder = resolve(
                this.root,
                this.config.worktreeRoot,
                'codex-builder',
              );
              await fastForwardBuilder(builder, auditedCommit);
              qaCommit = auditedCommit;
            }
            run = updateRun(this.root, this.config, run, {
              candidateCommit: auditedCommit,
              latestClaudeHandoff: invocation.path,
              qaCommit,
            });
            if (invocation.handoff.humanGateRequired) {
              run = this.humanGate(
                run,
                'qa_requested_human_gate',
                'Review the independent QA gate request.',
                'The QA agent reported that autonomous verification cannot safely continue.',
              );
            } else if (invocation.handoff.status === 'approved') {
              run = transition(
                this.root,
                this.config,
                run,
                'FINAL_VERIFICATION',
                'qa_approved',
                invocation.result.durationMs,
              );
            } else if (invocation.handoff.status === 'changes_requested') {
              if (run.repairCycles >= this.config.maxRepairCycles) {
                run = this.humanGate(
                  run,
                  'repair_cycle_limit_reached',
                  'Resolve the remaining agent disagreement.',
                  `The bounded limit of ${String(this.config.maxRepairCycles)} repair cycles was reached without independent QA approval.`,
                );
              } else {
                run = updateRun(this.root, this.config, run, {
                  repairCycles: run.repairCycles + 1,
                });
                run = transition(
                  this.root,
                  this.config,
                  run,
                  'CODEX_REPAIR',
                  'qa_changes_requested',
                  invocation.result.durationMs,
                );
              }
            } else throw new Error('Claude returned a terminal failure.');
            break;
          }
          case 'CODEX_REPAIR': {
            const priorCandidate = run.candidateCommit;
            const invocation = await this.invokeAgent(
              run,
              'codex',
              true,
              workPackage,
            );
            run = this.accountInvocationCost(run, invocation.costUsd);
            if (invocation.handoff.status !== 'ready_for_retest')
              throw new Error('Codex repair did not return ready_for_retest.');
            let candidateCommit = invocation.handoff.candidateCommit;
            if (!candidateCommit)
              throw new Error('Codex repair omitted its candidate commit.');
            const builder = resolve(
              this.root,
              this.config.worktreeRoot,
              'codex-builder',
            );
            const builderHead = await resolveCommit(builder, 'HEAD');
            const builderChanges = await workingTreePaths(builder);
            if (builderChanges.length > 0) {
              if (
                builderHead !== priorCandidate ||
                candidateCommit !== builderHead
              )
                throw new Error(
                  'Uncommitted repair output is not based on the exact candidate.',
                );
              assertPathsAllowed(
                builder,
                builderChanges,
                workPackage.allowedImplementationPaths,
              );
              candidateCommit = await commitValidatedWorkingTree(
                builder,
                `${run.workPackageId}: supervised repair ${String(run.repairCycles)}`,
              );
            } else {
              await exactHead(builder, candidateCommit);
              await assertClean(builder);
            }
            if (candidateCommit === priorCandidate)
              throw new Error(
                'Repair must produce a new exact candidate commit.',
              );
            assertPathsAllowed(
              builder,
              await changedPaths(builder, run.baseCommit, candidateCommit),
              workPackage.allowedImplementationPaths,
            );
            run = updateRun(this.root, this.config, run, {
              candidateCommit,
              latestCodexHandoff: invocation.path,
            });
            run = transition(
              this.root,
              this.config,
              run,
              'CLAUDE_RETEST',
              'repair_candidate_validated',
              invocation.result.durationMs,
            );
            break;
          }
          case 'FINAL_VERIFICATION': {
            const commands = run.pilotMode
              ? [
                  `${process.execPath} ${resolve(
                    this.root,
                    'scripts/agents/fixtures/pilot-check.mjs',
                  )}`,
                ]
              : this.config.finalVerificationCommands;
            await this.deterministicChecks(run, commands);
            const decisionPath = handoffPath(
              this.root,
              this.config.runRoot,
              run.runId,
              'final-decision.json',
            );
            writeFileSync(
              decisionPath,
              `${JSON.stringify(
                {
                  actor: 'supervisor',
                  authorizedCostCeilingUsd: run.authorizedCostCeilingUsd,
                  baseCommit: run.baseCommit,
                  candidateCommit: run.candidateCommit,
                  commandsExecuted: commands,
                  evidencePaths: [
                    run.latestCodexHandoff,
                    run.latestClaudeHandoff,
                  ].filter(Boolean),
                  estimatedCostUsd: run.estimatedCostUsd,
                  findings: [],
                  humanGateRequired: false,
                  mergeAuthorized: false,
                  nextRequestedActor: 'human',
                  protocolVersion: PROTOCOL_VERSION,
                  repairCycles: run.repairCycles,
                  requirementsEvaluated: workPackage.requirements.map(
                    (item) => item.id,
                  ),
                  runId: run.runId,
                  status: 'approved',
                  testResults: [],
                  workPackageId: run.workPackageId,
                },
                null,
                2,
              )}\n`,
              { mode: 0o600 },
            );
            run = transition(
              this.root,
              this.config,
              run,
              'READY_TO_MERGE',
              'final_verification_passed',
            );
            break;
          }
          default:
            throw new Error(`Unsupported active state: ${run.state}`);
        }
      }
      return run;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown failure';
      if (
        scanSensitiveText(message).length > 0 ||
        /secret scanning/iu.test(message)
      ) {
        run = updateRun(this.root, this.config, run, {
          activeChildPid: null,
          lastErrorCode: 'SUSPECTED_SECRET_EXPOSURE',
        });
        return this.humanGate(
          run,
          'suspected_secret_exposure',
          'Review the content-free secret-scanner finding and rotate affected credentials if exposure is confirmed.',
          'A governed prompt, output, log, or artifact matched a secret pattern; no sensitive value is copied into this report.',
        );
      }
      if (/approved scope|exceed the approved/iu.test(message)) {
        run = updateRun(this.root, this.config, run, {
          activeChildPid: null,
          lastErrorCode: 'SCOPE_EXPANSION',
        });
        return this.humanGate(
          run,
          'scope_expansion',
          'Approve a revised work-package path boundary or reject the out-of-scope change.',
          'An agent changed a path outside the committed allowlist.',
        );
      }
      run = updateRun(this.root, this.config, run, {
        activeChildPid: null,
        lastErrorCode: 'SUPERVISOR_FAILED',
      });
      transition(this.root, this.config, run, 'FAILED', 'supervisor_failure');
      throw error;
    } finally {
      release();
    }
  }

  public async cleanup(runId: string): Promise<void> {
    const run = loadRun(this.root, this.config.runRoot, runId);
    if (!['READY_TO_MERGE', 'FAILED', 'HUMAN_GATE'].includes(run.state))
      throw new Error(
        'Active worktrees cannot be cleaned before a terminal state.',
      );
    await removeAgentWorktrees(this.root, [
      resolve(this.root, this.config.worktreeRoot, 'codex-builder'),
      resolve(this.root, this.config.worktreeRoot, 'claude-auditor'),
    ]);
  }

  public async deliver(runId: string): Promise<void> {
    const run = this.load(runId);
    const workPackage = loadWorkPackage(this.root, run.workPackageId);
    if (run.state !== 'READY_TO_MERGE' || !run.candidateCommit)
      throw new Error(
        'Only an exact READY_TO_MERGE candidate can be delivered.',
      );
    if (!workPackage.automaticMergeAllowed)
      throw new Error(
        'The committed work-package definition does not authorize delivery.',
      );
    if (
      !this.config.pushBranches &&
      !this.config.openPullRequest &&
      !this.config.automaticMerge
    )
      throw new Error('All governed delivery controls are disabled.');
    const builder = resolve(
      this.root,
      this.config.worktreeRoot,
      'codex-builder',
    );
    await exactHead(builder, run.candidateCommit);
    await assertClean(builder);
    if (this.config.pushBranches) {
      await pushExactBranch(this.root, run.candidateCommit, run.branchName);
      if (run.qaCommit)
        await pushExactBranch(this.root, run.qaCommit, run.qaBranchName);
    }
    if (this.config.openPullRequest) {
      if (!this.config.pushBranches)
        throw new Error(
          'Pull-request creation requires branch push to be enabled.',
        );
      const existing = await runCommand({
        args: ['pr', 'view', run.branchName, '--json', 'number'],
        command: 'gh',
        cwd: this.root,
        environment: safeChildEnvironment({}),
        timeoutMs: 120_000,
      });
      if (existing.exitCode !== 0) {
        const created = await runCommand({
          args: [
            'pr',
            'create',
            '--base',
            'main',
            '--head',
            run.branchName,
            '--title',
            `${run.workPackageId}: ${workPackage.title}`,
            '--body',
            `Governed candidate ${run.candidateCommit}; final verification passed.`,
          ],
          command: 'gh',
          cwd: this.root,
          environment: safeChildEnvironment({}),
          timeoutMs: 120_000,
        });
        if (created.exitCode !== 0)
          throw new Error('Governed pull-request creation failed.');
      }
    }
    if (this.config.automaticMerge) {
      const localOriginMain = await resolveCommit(this.root, 'origin/main');
      if (localOriginMain !== run.baseCommit)
        throw new Error(
          'origin/main no longer matches the approved base; automatic fast-forward is refused.',
        );
      if (!(await isAncestor(this.root, run.baseCommit, run.candidateCommit)))
        throw new Error('The verified candidate cannot fast-forward main.');
      await pushExactBranch(this.root, run.candidateCommit, 'main');
    }
    const deliveryPath = handoffPath(
      this.root,
      this.config.runRoot,
      run.runId,
      'delivery.json',
    );
    writeFileSync(
      deliveryPath,
      `${JSON.stringify(
        {
          automaticFastForward: this.config.automaticMerge,
          implementationBranchPushed: this.config.pushBranches,
          pullRequestEnsured: this.config.openPullRequest,
          qaBranchPushed: this.config.pushBranches && run.qaCommit !== null,
          runId: run.runId,
          verifiedCandidate: run.candidateCommit,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
  }

  public load(runId: string): RunRecord {
    return loadRun(this.root, this.config.runRoot, runId);
  }

  public report(runId: string): string {
    const run = this.load(runId);
    const historyPath = resolve(
      runDirectory(this.root, this.config.runRoot, runId),
      'transitions.jsonl',
    );
    const transitions = existsSync(historyPath)
      ? readFileSync(historyPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    return JSON.stringify(
      {
        authorizedCostCeilingUsd: run.authorizedCostCeilingUsd,
        baseCommit: run.baseCommit,
        candidateCommit: run.candidateCommit,
        estimatedCostUsd: run.estimatedCostUsd,
        humanGateRequired: run.state === 'HUMAN_GATE',
        mergeAuthorized: false,
        pilotMode: run.pilotMode,
        qaCommit: run.qaCommit,
        repairCycles: run.repairCycles,
        runId,
        simulatedAgents: run.simulatedAgents,
        state: run.state,
        transitions,
        workPackageId: run.workPackageId,
      },
      null,
      2,
    );
  }
}
