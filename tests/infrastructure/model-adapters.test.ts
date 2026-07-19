import { describe, expect, it } from 'vitest';
import type { ModelInvocationRequest } from '../../packages/domain/src/index.js';
import {
  AnthropicMessagesAdapter,
  GeminiGenerateContentAdapter,
  MODEL_CANDIDATES,
  OpenAiResponsesAdapter,
  createEvaluationAdapters,
  modelInvocationCostUsd,
} from '../../packages/infrastructure-models/src/index.js';

const baseRequest = {
  fixtureId: 'fixture-a',
  maxOutputTokens: 700,
  outputAuthority: 'evaluation_only',
  outputSchema: { additionalProperties: false, properties: {}, type: 'object' },
  processingClass: 'standard',
  prompt: 'synthetic fixture',
  promptId: 'task-routing-evaluation',
  promptVersion: '1.0.0',
  purpose: 'evaluation',
  reasoningEffort: 'none',
  systemInstruction: 'Return JSON.',
  taskClass: 'bounded_classification',
  timeoutMilliseconds: 10_000,
} as const;

function request(
  provider: ModelInvocationRequest['provider'],
): ModelInvocationRequest {
  return {
    ...baseRequest,
    modelId:
      provider === 'openai'
        ? MODEL_CANDIDATES.luna.modelId
        : provider === 'anthropic'
          ? 'claude-sonnet-5'
          : 'gemini-3.5-flash',
    provider,
  };
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') throw new Error('Expected a JSON string body.');
  return JSON.parse(body) as Record<string, unknown>;
}

describe('evaluation-only provider adapters', () => {
  it('uses OpenAI Responses structured output without server-side storage', async () => {
    let body: Record<string, unknown> = {};
    const adapter = new OpenAiResponsesAdapter('test-key', (_input, init) => {
      body = parseBody(init?.body);
      return Promise.resolve(
        Response.json({
          output: [
            { content: [{ text: '{}', type: 'output_text' }], type: 'message' },
          ],
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
      );
    });
    await expect(adapter.invoke(request('openai'))).resolves.toMatchObject({
      provider: 'openai',
      providerStatusCode: 200,
    });
    expect(body).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'none' },
      store: false,
    });
    expect(body).toHaveProperty('text.format.type', 'json_schema');
  });

  it('disables Anthropic thinking and asks for JSON without unsupported sampling controls', async () => {
    let body: Record<string, unknown> = {};
    const adapter = new AnthropicMessagesAdapter('test-key', (_input, init) => {
      body = parseBody(init?.body);
      return Promise.resolve(
        Response.json({
          content: [{ text: '{}', type: 'text' }],
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
      );
    });
    await adapter.invoke(request('anthropic'));
    expect(body).toMatchObject({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
    });
    expect(body).not.toHaveProperty('temperature');
  });

  it('uses Gemini JSON schema output configuration', async () => {
    let body: Record<string, unknown> = {};
    const adapter = new GeminiGenerateContentAdapter(
      'test-key',
      (_input, init) => {
        body = parseBody(init?.body);
        return Promise.resolve(
          Response.json({
            candidates: [{ content: { parts: [{ text: '{}' }] } }],
            usageMetadata: { candidatesTokenCount: 3, promptTokenCount: 12 },
          }),
        );
      },
    );
    await adapter.invoke(request('google'));
    expect(body).toHaveProperty(
      'generationConfig.responseMimeType',
      'application/json',
    );
    expect(body).toHaveProperty('generationConfig.responseJsonSchema');
  });

  it('does not leak provider error bodies and only creates configured adapters', async () => {
    const adapter = new OpenAiResponsesAdapter('test-key', () =>
      Promise.resolve(
        Response.json({ secret: 'must-not-escape' }, { status: 400 }),
      ),
    );
    await expect(adapter.invoke(request('openai'))).rejects.toMatchObject({
      providerStatusCode: 400,
      reason: 'provider_rejected',
    });
    expect(
      Object.keys(createEvaluationAdapters({ OPENAI_API_KEY: 'local' })),
    ).toEqual(['openai']);
  });

  it('calculates candidate cost from returned usage', () => {
    expect(
      modelInvocationCostUsd(MODEL_CANDIDATES.sol, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(35);
  });
});
