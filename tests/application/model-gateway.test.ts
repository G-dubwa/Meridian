import { describe, expect, it, vi } from 'vitest';
import { ModelGatewayService } from '../../packages/application/src/index.js';
import type {
  ModelInferencePort,
  ModelInvocationRequest,
  ModelInvocationResult,
} from '../../packages/domain/src/index.js';

const request = {
  fixtureId: 'fixture-a',
  maxOutputTokens: 700,
  modelId: 'model-a',
  outputAuthority: 'evaluation_only',
  outputSchema: { type: 'object' },
  processingClass: 'standard',
  prompt: 'synthetic input',
  promptId: 'task-routing-evaluation',
  promptVersion: '1.0.0',
  provider: 'openai',
  purpose: 'evaluation',
  reasoningEffort: 'none',
  systemInstruction: 'Return JSON.',
  taskClass: 'bounded_classification',
  timeoutMilliseconds: 10_000,
} as const satisfies ModelInvocationRequest;

const result = {
  latencyMilliseconds: 12,
  modelId: 'model-a',
  output: {},
  provider: 'openai',
  providerRequestId: null,
  providerStatusCode: 200,
  usage: { cachedInputTokens: 0, inputTokens: 10, outputTokens: 4 },
} as const satisfies ModelInvocationResult;

const noConsent = {
  sensitiveExternalEmbedding: false,
  sensitiveExternalLlm: false,
  sensitiveProactiveSurfacing: false,
  standardProactiveEvidenceEligible: false,
} as const;

describe('model gateway privacy and telemetry boundary', () => {
  it.each(['private', 'sensitive'] as const)(
    'rejects %s content before invoking an external adapter',
    async (processingClass) => {
      const invoke = vi.fn<ModelInferencePort['invoke']>();
      const service = new ModelGatewayService({
        adapter: { invoke },
        consent: noConsent,
        observations: { observe: vi.fn() },
      });
      await expect(
        service.invoke({ ...request, processingClass }),
      ).rejects.toThrow(/processing route is not permitted/i);
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('accepts Standard content and records content-free metadata only', async () => {
    const observe = vi.fn();
    const service = new ModelGatewayService({
      adapter: { invoke: () => Promise.resolve(result) },
      consent: noConsent,
      observations: { observe },
    });
    await expect(service.invoke(request)).resolves.toEqual(result);
    const observation = observe.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(observation).toMatchObject({
      fixtureId: 'fixture-a',
      outcome: 'succeeded',
      providerStatusCode: 200,
      taskClass: 'bounded_classification',
    });
    expect(observation).not.toHaveProperty('prompt');
    expect(observation).not.toHaveProperty('output');
  });

  it('rejects a provider or model mismatch as invalid output', async () => {
    const service = new ModelGatewayService({
      adapter: {
        invoke: () => Promise.resolve({ ...result, modelId: 'wrong' }),
      },
      consent: noConsent,
      observations: { observe: vi.fn() },
    });
    await expect(service.invoke(request)).rejects.toMatchObject({
      reason: 'output_invalid',
    });
  });

  it('enforces the exact provisional production allowlist before adapter I/O', async () => {
    const invoke = vi.fn<ModelInferencePort['invoke']>();
    const service = new ModelGatewayService({
      adapter: { invoke },
      consent: noConsent,
      observations: { observe: vi.fn() },
    });
    await expect(
      service.invoke({
        ...request,
        modelId: 'gpt-5.6-sol',
        outputAuthority: 'triage_proposal_only',
        purpose: 'production',
        reasoningEffort: 'medium',
        taskClass: 'complex_planning',
      }),
    ).rejects.toMatchObject({ reason: 'configuration_invalid' });
    await expect(
      service.invoke({
        ...request,
        modelId: 'gpt-5.6-terra',
        outputAuthority: 'classification_or_triage_proposal',
        purpose: 'production',
        reasoningEffort: 'none',
        taskClass: 'bounded_extraction',
      }),
    ).rejects.toMatchObject({ reason: 'configuration_invalid' });
    await expect(
      service.invoke({
        ...request,
        modelId: 'gpt-5.6-sol',
        outputAuthority: 'classification_or_triage_proposal',
        purpose: 'production',
        reasoningEffort: 'none',
        taskClass: 'bounded_extraction',
      }),
    ).rejects.toMatchObject({ reason: 'configuration_invalid' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('allows the exact bounded production model and reasoning contract', async () => {
    const productionRequest = {
      ...request,
      modelId: 'gpt-5.6-sol',
      outputAuthority: 'triage_proposal_only',
      purpose: 'production',
      reasoningEffort: 'none',
      taskClass: 'bounded_extraction',
    } as const satisfies ModelInvocationRequest;
    const productionResult = {
      ...result,
      modelId: 'gpt-5.6-sol',
    } as const satisfies ModelInvocationResult;
    const service = new ModelGatewayService({
      adapter: { invoke: () => Promise.resolve(productionResult) },
      consent: noConsent,
      observations: { observe: vi.fn() },
    });
    await expect(service.invoke(productionRequest)).resolves.toEqual(
      productionResult,
    );
  });
});
