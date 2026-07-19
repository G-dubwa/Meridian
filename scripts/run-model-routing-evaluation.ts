import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ModelGatewayService,
  initialModelRouteV1,
} from '@meridian/application';
import { ModelGatewayError } from '@meridian/domain';
import type {
  ModelReasoningEffort,
  ModelTaskClass,
  ModelTokenUsage,
} from '@meridian/domain';
import {
  MODEL_CANDIDATES,
  OpenAiResponsesAdapter,
  modelInvocationCostUsd,
} from '@meridian/infrastructure-models';
import {
  TASK_ROUTING_PROMPT_ID,
  TASK_ROUTING_PROMPT_VERSION,
  renderTaskRoutingPromptV1,
  taskRoutingOutputJsonSchemaV1,
  taskRoutingOutputV1Schema,
  taskRoutingSystemInstructionV1,
} from '@meridian/prompts';
import {
  TASK_ROUTING_FIXTURES_V1,
  aggregateTaskClassV1,
  invalidTaskFixtureScoreV1,
  passesTaskClassV1,
  scoreTaskFixtureV1,
  taskQualityThresholdV1,
} from '../evals/task-routing-v1.js';
import type {
  TaskFixtureScoreV1,
  TaskRoutingFixtureV1,
} from '../evals/task-routing-v1.js';

type EvaluatedTaskClass = Exclude<ModelTaskClass, 'deterministic_operation'>;
type Tier = keyof typeof MODEL_CANDIDATES;

const TIERS = ['luna', 'terra', 'sol'] as const satisfies readonly Tier[];
const SMOKE_FIXTURE_ID = 'bounded-reflection-classification';

interface Arguments {
  readonly confirmed: boolean;
  readonly maxCostUsd: number;
  readonly priorCostUsd: number;
  readonly smokeTestLuna: boolean;
}

interface FixtureReport {
  readonly invocationCostUsd: number;
  readonly latencyMilliseconds: number;
  readonly providerStatusCode: number | null;
  readonly score: TaskFixtureScoreV1;
  readonly usage: ModelTokenUsage | null;
}

function parseArguments(values: readonly string[]): Arguments {
  const confirmed = values.includes('--confirm-paid-evaluation');
  const smokeTestLuna = values.includes('--smoke-test-luna');
  const costValue = values.find((value) => value.startsWith('--max-cost-usd='));
  const priorCostValue = values.find((value) =>
    value.startsWith('--prior-cost-usd='),
  );
  const maxCostUsd = Number(costValue?.split('=')[1]);
  const priorCostUsd = Number(priorCostValue?.split('=')[1] ?? '0');
  if (!confirmed)
    throw new Error('Refusing paid calls without --confirm-paid-evaluation.');
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0)
    throw new Error('Set a positive --max-cost-usd= ceiling.');
  if (!Number.isFinite(priorCostUsd) || priorCostUsd < 0)
    throw new Error('Set --prior-cost-usd= to zero or a positive amount.');
  return { confirmed, maxCostUsd, priorCostUsd, smokeTestLuna };
}

function maxOutputTokens(taskClass: EvaluatedTaskClass): number {
  return taskClass.startsWith('bounded_')
    ? 400
    : taskClass === 'complex_planning' ||
        taskClass === 'difficult_synthesis' ||
        taskClass === 'safety_sensitive_review'
      ? 900
      : 700;
}

function evaluationReasoningEffort(
  taskClass: EvaluatedTaskClass,
): ModelReasoningEffort {
  return taskClass.startsWith('bounded_')
    ? 'none'
    : taskClass === 'complex_planning' ||
        taskClass === 'difficult_synthesis' ||
        taskClass === 'safety_sensitive_review'
      ? 'medium'
      : 'low';
}

function conservativeInputTokens(text: string): number {
  return Math.ceil(text.length * 1.25) + 200;
}

function estimatedInvocationCost(
  tier: Tier,
  fixture: TaskRoutingFixtureV1,
): number {
  const prompt = `${taskRoutingSystemInstructionV1}${renderTaskRoutingPromptV1(fixture.taskClass, fixture.input)}${JSON.stringify(taskRoutingOutputJsonSchemaV1)}`;
  return modelInvocationCostUsd(MODEL_CANDIDATES[tier], {
    inputTokens: conservativeInputTokens(prompt),
    outputTokens: maxOutputTokens(fixture.taskClass),
  });
}

function worstCaseCost(
  tiers: readonly Tier[],
  fixtures: readonly TaskRoutingFixtureV1[],
): number {
  return tiers.reduce(
    (total, tier) =>
      total +
      fixtures.reduce(
        (fixtureTotal, fixture) =>
          fixtureTotal + estimatedInvocationCost(tier, fixture),
        0,
      ),
    0,
  );
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const smokeFixture = TASK_ROUTING_FIXTURES_V1.find(
    ({ id }) => id === SMOKE_FIXTURE_ID,
  );
  if (!smokeFixture) throw new Error('Smoke-test fixture missing.');
  const selectedTiers: readonly Tier[] = options.smokeTestLuna
    ? ['luna']
    : TIERS;
  const selectedFixtures: readonly TaskRoutingFixtureV1[] =
    options.smokeTestLuna ? [smokeFixture] : TASK_ROUTING_FIXTURES_V1;
  const selectedTaskClasses = [
    ...new Set(selectedFixtures.map(({ taskClass }) => taskClass)),
  ];
  const upperBound = worstCaseCost(selectedTiers, selectedFixtures);
  if (options.priorCostUsd + upperBound > options.maxCostUsd)
    throw new Error(
      `Prior cost plus worst-case estimate $${(options.priorCostUsd + upperBound).toFixed(4)} exceeds the approved ceiling.`,
    );
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error('Missing local API key variable: OPENAI_API_KEY.');

  const adapter = new OpenAiResponsesAdapter(apiKey);
  const directory = resolve('evals/results');
  await mkdir(directory, { recursive: true });
  const checkpointPath = resolve(
    directory,
    `task-routing-checkpoint-${String(Date.now())}.local.json`,
  );
  console.log(`Content-free progress checkpoint: ${checkpointPath}`);
  const modelReports = [];
  let smokeDiagnostic: FixtureReport | null = null;
  let totalCostUsd = 0;
  let attemptedInvocations = 0;
  for (const tier of selectedTiers) {
    const candidate = MODEL_CANDIDATES[tier];
    const fixtureReports: FixtureReport[] = [];
    for (const fixture of selectedFixtures) {
      const remainingEstimate = estimatedInvocationCost(tier, fixture);
      if (
        options.priorCostUsd + totalCostUsd + remainingEstimate >
        options.maxCostUsd
      )
        throw new Error(
          'Approved cost ceiling would be exceeded; evaluation stopped.',
        );
      if (attemptedInvocations > 0) await delay(7_000);
      attemptedInvocations += 1;
      const gateway = new ModelGatewayService({
        adapter,
        consent: {
          sensitiveExternalEmbedding: false,
          sensitiveExternalLlm: fixture.processingClass === 'sensitive',
          sensitiveProactiveSurfacing: false,
          standardProactiveEvidenceEligible: false,
        },
        observations: { observe: () => undefined },
      });
      try {
        const result = await gateway.invoke({
          fixtureId: fixture.id,
          maxOutputTokens: maxOutputTokens(fixture.taskClass),
          modelId: candidate.modelId,
          outputAuthority: 'evaluation_only',
          outputSchema: taskRoutingOutputJsonSchemaV1,
          processingClass: fixture.processingClass,
          prompt: renderTaskRoutingPromptV1(fixture.taskClass, fixture.input),
          promptId: TASK_ROUTING_PROMPT_ID,
          promptVersion: TASK_ROUTING_PROMPT_VERSION,
          provider: 'openai',
          purpose: 'evaluation',
          reasoningEffort: evaluationReasoningEffort(fixture.taskClass),
          systemInstruction: taskRoutingSystemInstructionV1,
          taskClass: fixture.taskClass,
          timeoutMilliseconds: 90_000,
        });
        const invocationCostUsd = modelInvocationCostUsd(
          candidate,
          result.usage,
        );
        totalCostUsd += invocationCostUsd;
        const parsed = taskRoutingOutputV1Schema.safeParse(result.output);
        const fixtureReport: FixtureReport = {
          invocationCostUsd,
          latencyMilliseconds: result.latencyMilliseconds,
          providerStatusCode: result.providerStatusCode,
          score: parsed.success
            ? scoreTaskFixtureV1(fixture, parsed.data)
            : invalidTaskFixtureScoreV1(fixture),
          usage: result.usage,
        };
        fixtureReports.push(fixtureReport);
        if (options.smokeTestLuna) smokeDiagnostic = fixtureReport;
        await writeFile(
          checkpointPath,
          `${JSON.stringify(
            {
              completedModels: modelReports,
              currentTier: tier,
              fixtureReports,
              priorCostUsd: options.priorCostUsd,
              spentThisRunUsd: totalCostUsd,
              status: 'in_progress',
            },
            null,
            2,
          )}\n`,
          { mode: 0o600 },
        );
      } catch (error) {
        if (
          error instanceof ModelGatewayError &&
          error.reason === 'output_invalid'
        ) {
          fixtureReports.push({
            invocationCostUsd: 0,
            latencyMilliseconds: 0,
            providerStatusCode: error.providerStatusCode,
            score: invalidTaskFixtureScoreV1(fixture),
            usage: null,
          });
          await writeFile(
            checkpointPath,
            `${JSON.stringify(
              {
                completedModels: modelReports,
                currentTier: tier,
                fixtureReports,
                priorCostUsd: options.priorCostUsd,
                spentThisRunUsd: totalCostUsd,
                status: 'in_progress',
              },
              null,
              2,
            )}\n`,
            { mode: 0o600 },
          );
          continue;
        }
        throw error;
      }
    }
    const taskClasses = selectedTaskClasses.map((taskClass) => {
      const selected = fixtureReports.filter(
        ({ score }) => score.taskClass === taskClass,
      );
      const aggregate = aggregateTaskClassV1(
        taskClass,
        selected.map(({ score }) => score),
        selected.reduce(
          (total, report) => total + report.latencyMilliseconds,
          0,
        ),
        selected.reduce((total, report) => total + report.invocationCostUsd, 0),
      );
      return { ...aggregate, passed: passesTaskClassV1(aggregate) };
    });
    modelReports.push({ candidate, taskClasses });
  }

  const report = {
    externalProviderEvaluationRequiredWhen:
      'Any task class fails its routed GPT-5.6 tier and Sol escalation, or an operational requirement cannot be met by OpenAI.',
    generatedAt: new Date().toISOString(),
    models: modelReports,
    prompt: {
      id: TASK_ROUTING_PROMPT_ID,
      version: TASK_ROUTING_PROMPT_VERSION,
    },
    proposedRouting: selectedTaskClasses.map((taskClass) => ({
      initial: initialModelRouteV1(taskClass),
      qualityThreshold: taskQualityThresholdV1(taskClass),
    })),
    totalCostUsd,
    totalCumulativeCostUsd: options.priorCostUsd + totalCostUsd,
    priorCostUsd: options.priorCostUsd,
    smokeDiagnostic,
    smokeTestLuna: options.smokeTestLuna,
    worstCaseEstimateUsd: upperBound,
  };
  await writeFile(
    checkpointPath,
    `${JSON.stringify(
      {
        completedModels: modelReports,
        currentTier: null,
        fixtureReports: [],
        priorCostUsd: options.priorCostUsd,
        spentThisRunUsd: totalCostUsd,
        status: 'completed',
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  const path = resolve(
    directory,
    `task-routing-${String(Date.now())}.local.json`,
  );
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Aggregate-only local report written to ${path}`);
  if (options.smokeTestLuna) {
    const smoke: FixtureReport | null = smokeDiagnostic;
    if (!smoke?.usage || smoke.providerStatusCode === null)
      throw new Error('Smoke test did not produce complete diagnostics.');
    console.log(
      `Luna smoke test succeeded: HTTP ${String(smoke.providerStatusCode)}; input=${String(smoke.usage.inputTokens)} cached=${String(smoke.usage.cachedInputTokens)} output=${String(smoke.usage.outputTokens)} tokens; latency=${String(smoke.latencyMilliseconds)}ms; locally estimated cost=$${smoke.invocationCostUsd.toFixed(6)}.`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Model evaluation failed.',
  );
  process.exitCode = 1;
});
