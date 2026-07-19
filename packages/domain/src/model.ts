import { z } from 'zod';
import { processingClassV1Schema } from './processing-class.js';

export const modelProviderV1Schema = z.enum(['openai', 'anthropic', 'google']);
export type ModelProvider = z.infer<typeof modelProviderV1Schema>;

export const modelInvocationPurposeV1Schema = z.enum([
  'evaluation',
  'production',
]);
export type ModelInvocationPurpose = z.infer<
  typeof modelInvocationPurposeV1Schema
>;

export const modelInvocationOutputAuthorityV1Schema = z.enum([
  'classification_or_triage_proposal',
  'evaluation_only',
  'triage_proposal_only',
]);
export type ModelInvocationOutputAuthority = z.infer<
  typeof modelInvocationOutputAuthorityV1Schema
>;

export const modelTaskClassV1Schema = z.enum([
  'deterministic_operation',
  'bounded_extraction',
  'bounded_classification',
  'ambiguous_interpretation',
  'weekly_review',
  'knowledge_extraction',
  'contextual_reasoning',
  'complex_planning',
  'difficult_synthesis',
  'safety_sensitive_review',
]);
export type ModelTaskClass = z.infer<typeof modelTaskClassV1Schema>;

export const modelReasoningEffortV1Schema = z.enum([
  'none',
  'low',
  'medium',
  'high',
]);
export type ModelReasoningEffort = z.infer<typeof modelReasoningEffortV1Schema>;

export const modelTokenUsageV1Schema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
  })
  .strict();
export type ModelTokenUsage = z.infer<typeof modelTokenUsageV1Schema>;

export const modelInvocationRequestV1Schema = z
  .object({
    fixtureId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    maxOutputTokens: z.number().int().min(1).max(8192),
    modelId: z.string().min(1).max(160),
    outputAuthority: modelInvocationOutputAuthorityV1Schema,
    outputSchema: z.record(z.string(), z.unknown()),
    processingClass: processingClassV1Schema,
    prompt: z.string().min(1).max(32_000),
    promptId: z.string().min(1).max(120),
    promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    provider: modelProviderV1Schema,
    purpose: modelInvocationPurposeV1Schema,
    reasoningEffort: modelReasoningEffortV1Schema,
    systemInstruction: z.string().min(1).max(16_000),
    taskClass: modelTaskClassV1Schema.exclude(['deterministic_operation']),
    timeoutMilliseconds: z.number().int().min(1_000).max(120_000),
  })
  .strict();
export type ModelInvocationRequest = z.infer<
  typeof modelInvocationRequestV1Schema
>;

export const modelInvocationResultV1Schema = z
  .object({
    latencyMilliseconds: z.number().int().nonnegative(),
    modelId: z.string().min(1).max(160),
    output: z.unknown(),
    provider: modelProviderV1Schema,
    providerRequestId: z.string().min(1).max(255).nullable(),
    providerStatusCode: z.number().int().min(200).max(299),
    usage: modelTokenUsageV1Schema,
  })
  .strict();
export type ModelInvocationResult = z.infer<
  typeof modelInvocationResultV1Schema
>;

export const modelInvocationObservationV1Schema = z
  .object({
    failureReason: z
      .enum([
        'configuration_invalid',
        'output_invalid',
        'provider_rejected',
        'provider_unavailable',
        'timeout',
      ])
      .nullable(),
    fixtureId: z.string().min(1).max(120),
    latencyMilliseconds: z.number().int().nonnegative(),
    modelId: z.string().min(1).max(160),
    outcome: z.enum(['failed', 'succeeded']),
    promptId: z.string().min(1).max(120),
    promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    provider: modelProviderV1Schema,
    providerStatusCode: z.number().int().min(100).max(599).nullable(),
    purpose: modelInvocationPurposeV1Schema,
    taskClass: modelTaskClassV1Schema.exclude(['deterministic_operation']),
    usage: modelTokenUsageV1Schema.nullable(),
  })
  .strict();
export type ModelInvocationObservationV1 = z.infer<
  typeof modelInvocationObservationV1Schema
>;

export type ModelGatewayFailureReason =
  | 'configuration_invalid'
  | 'output_invalid'
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'timeout';

export class ModelGatewayError extends Error {
  public constructor(
    public readonly reason: ModelGatewayFailureReason,
    public readonly providerStatusCode: number | null = null,
  ) {
    super(
      providerStatusCode === null
        ? reason
        : `${reason} (HTTP ${String(providerStatusCode)})`,
    );
    this.name = 'ModelGatewayError';
  }
}
