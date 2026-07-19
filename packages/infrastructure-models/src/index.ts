import {
  ModelGatewayError,
  modelInvocationRequestV1Schema,
} from '@meridian/domain';
import type {
  ModelInferencePort,
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider,
} from '@meridian/domain';

export interface ModelCandidate {
  readonly contextTokens: number;
  readonly inputUsdPerMillionTokens: number;
  readonly maxOutputTokens: number;
  readonly modelId: string;
  readonly outputUsdPerMillionTokens: number;
  readonly provider: ModelProvider;
  readonly tier: 'luna' | 'terra' | 'sol';
  readonly verifiedOn: string;
}

export const MODEL_CANDIDATES = {
  luna: {
    contextTokens: 1_050_000,
    inputUsdPerMillionTokens: 1,
    maxOutputTokens: 128_000,
    modelId: 'gpt-5.6-luna',
    outputUsdPerMillionTokens: 6,
    provider: 'openai',
    tier: 'luna',
    verifiedOn: '2026-07-19',
  },
  sol: {
    contextTokens: 1_050_000,
    inputUsdPerMillionTokens: 5,
    maxOutputTokens: 128_000,
    modelId: 'gpt-5.6-sol',
    outputUsdPerMillionTokens: 30,
    provider: 'openai',
    tier: 'sol',
    verifiedOn: '2026-07-19',
  },
  terra: {
    contextTokens: 1_050_000,
    inputUsdPerMillionTokens: 2.5,
    maxOutputTokens: 128_000,
    modelId: 'gpt-5.6-terra',
    outputUsdPerMillionTokens: 15,
    provider: 'openai',
    tier: 'terra',
    verifiedOn: '2026-07-19',
  },
} as const satisfies Record<'luna' | 'terra' | 'sol', ModelCandidate>;

export interface ModelEvaluationEnvironment {
  readonly OPENAI_API_KEY?: string;
}

export interface DeferredExternalModelEnvironment {
  readonly ANTHROPIC_API_KEY?: string;
  readonly GEMINI_API_KEY?: string;
}

interface HttpResponse {
  readonly headers: Headers;
  readonly json: () => Promise<unknown>;
  readonly ok: boolean;
  readonly status: number;
}

export type ModelFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<HttpResponse>;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ModelGatewayError('output_invalid');
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0)
    throw new ModelGatewayError('output_invalid');
  return value;
}

function tokenCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ModelGatewayError('output_invalid');
  }
}

function openAiOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') return data.output_text;
  if (!Array.isArray(data.output))
    throw new ModelGatewayError('output_invalid');
  for (const itemValue of data.output) {
    const item = asRecord(itemValue);
    if (!Array.isArray(item.content)) continue;
    for (const contentValue of item.content) {
      const content = asRecord(contentValue);
      if (content.type === 'output_text' && typeof content.text === 'string')
        return content.text;
    }
  }
  throw new ModelGatewayError('output_invalid');
}

function providerFailure(status: number): ModelGatewayError {
  return new ModelGatewayError(
    status === 408 || status === 504
      ? 'timeout'
      : status >= 500
        ? 'provider_unavailable'
        : 'provider_rejected',
    status,
  );
}

abstract class HttpModelAdapter implements ModelInferencePort {
  protected constructor(
    protected readonly apiKey: string,
    protected readonly fetcher: ModelFetch = fetch,
  ) {}

  public abstract invoke(
    input: ModelInvocationRequest,
  ): Promise<ModelInvocationResult>;

  protected async post(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMilliseconds: number,
  ): Promise<{ data: Record<string, unknown>; response: HttpResponse }> {
    let response: HttpResponse;
    try {
      response = await this.fetcher(url, {
        body: JSON.stringify(body),
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError')
        throw new ModelGatewayError('timeout');
      throw new ModelGatewayError('provider_unavailable');
    }
    if (!response.ok) throw providerFailure(response.status);
    try {
      return { data: asRecord(await response.json()), response };
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;
      throw new ModelGatewayError('output_invalid');
    }
  }
}

export class OpenAiResponsesAdapter extends HttpModelAdapter {
  public constructor(apiKey: string, fetcher?: ModelFetch) {
    super(apiKey, fetcher);
  }

  public async invoke(
    input: ModelInvocationRequest,
  ): Promise<ModelInvocationResult> {
    const request = modelInvocationRequestV1Schema.parse(input);
    const startedAt = performance.now();
    const { data, response } = await this.post(
      'https://api.openai.com/v1/responses',
      {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      {
        input: request.prompt,
        instructions: request.systemInstruction,
        max_output_tokens: request.maxOutputTokens,
        model: request.modelId,
        reasoning: { effort: request.reasoningEffort },
        store: false,
        text: {
          format: {
            name: request.promptId.replaceAll('-', '_'),
            schema: request.outputSchema,
            strict: true,
            type: 'json_schema',
          },
        },
      },
      request.timeoutMilliseconds,
    );
    const usage = asRecord(data.usage);
    return {
      latencyMilliseconds: Math.round(performance.now() - startedAt),
      modelId: request.modelId,
      output: parseJson(openAiOutputText(data)),
      provider: 'openai',
      providerRequestId: response.headers.get('x-request-id'),
      providerStatusCode: response.status,
      usage: {
        cachedInputTokens: tokenCount(
          asRecord(usage.input_tokens_details ?? {}),
          'cached_tokens',
        ),
        inputTokens: tokenCount(usage, 'input_tokens'),
        outputTokens: tokenCount(usage, 'output_tokens'),
      },
    };
  }
}

export class AnthropicMessagesAdapter extends HttpModelAdapter {
  public constructor(apiKey: string, fetcher?: ModelFetch) {
    super(apiKey, fetcher);
  }

  public async invoke(
    input: ModelInvocationRequest,
  ): Promise<ModelInvocationResult> {
    const request = modelInvocationRequestV1Schema.parse(input);
    const startedAt = performance.now();
    const { data, response } = await this.post(
      'https://api.anthropic.com/v1/messages',
      {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      {
        max_tokens: request.maxOutputTokens,
        messages: [{ content: request.prompt, role: 'user' }],
        model: request.modelId,
        system: `${request.systemInstruction}\nReturn one JSON object matching this JSON Schema:\n${JSON.stringify(request.outputSchema)}`,
        thinking: { type: 'disabled' },
      },
      request.timeoutMilliseconds,
    );
    const content = data.content;
    if (!Array.isArray(content)) throw new ModelGatewayError('output_invalid');
    const first = asRecord(content[0]);
    const usage = asRecord(data.usage);
    return {
      latencyMilliseconds: Math.round(performance.now() - startedAt),
      modelId: request.modelId,
      output: parseJson(requiredString(first, 'text')),
      provider: 'anthropic',
      providerRequestId: response.headers.get('request-id'),
      providerStatusCode: response.status,
      usage: {
        cachedInputTokens: tokenCount(usage, 'cache_read_input_tokens'),
        inputTokens: tokenCount(usage, 'input_tokens'),
        outputTokens: tokenCount(usage, 'output_tokens'),
      },
    };
  }
}

export class GeminiGenerateContentAdapter extends HttpModelAdapter {
  public constructor(apiKey: string, fetcher?: ModelFetch) {
    super(apiKey, fetcher);
  }

  public async invoke(
    input: ModelInvocationRequest,
  ): Promise<ModelInvocationResult> {
    const request = modelInvocationRequestV1Schema.parse(input);
    const startedAt = performance.now();
    const { data, response } = await this.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.modelId)}:generateContent`,
      { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      {
        contents: [{ parts: [{ text: request.prompt }], role: 'user' }],
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          responseJsonSchema: request.outputSchema,
          responseMimeType: 'application/json',
        },
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
      },
      request.timeoutMilliseconds,
    );
    const candidates = data.candidates;
    if (!Array.isArray(candidates))
      throw new ModelGatewayError('output_invalid');
    const candidate = asRecord(candidates[0]);
    const content = asRecord(candidate.content);
    const parts = content.parts;
    if (!Array.isArray(parts)) throw new ModelGatewayError('output_invalid');
    const part = asRecord(parts[0]);
    const usage = asRecord(data.usageMetadata);
    return {
      latencyMilliseconds: Math.round(performance.now() - startedAt),
      modelId: request.modelId,
      output: parseJson(requiredString(part, 'text')),
      provider: 'google',
      providerRequestId: response.headers.get('x-request-id'),
      providerStatusCode: response.status,
      usage: {
        cachedInputTokens: tokenCount(usage, 'cachedContentTokenCount'),
        inputTokens: tokenCount(usage, 'promptTokenCount'),
        outputTokens: tokenCount(usage, 'candidatesTokenCount'),
      },
    };
  }
}

export function createEvaluationAdapters(
  environment: ModelEvaluationEnvironment & DeferredExternalModelEnvironment,
  fetcher?: ModelFetch,
): Partial<Record<ModelProvider, ModelInferencePort>> {
  return {
    ...(environment.ANTHROPIC_API_KEY
      ? {
          anthropic: new AnthropicMessagesAdapter(
            environment.ANTHROPIC_API_KEY,
            fetcher,
          ),
        }
      : {}),
    ...(environment.GEMINI_API_KEY
      ? {
          google: new GeminiGenerateContentAdapter(
            environment.GEMINI_API_KEY,
            fetcher,
          ),
        }
      : {}),
    ...(environment.OPENAI_API_KEY
      ? {
          openai: new OpenAiResponsesAdapter(
            environment.OPENAI_API_KEY,
            fetcher,
          ),
        }
      : {}),
  };
}

export function modelInvocationCostUsd(
  candidate: ModelCandidate,
  usage: { readonly inputTokens: number; readonly outputTokens: number },
): number {
  return (
    (usage.inputTokens * candidate.inputUsdPerMillionTokens +
      usage.outputTokens * candidate.outputUsdPerMillionTokens) /
    1_000_000
  );
}
