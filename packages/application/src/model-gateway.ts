import {
  ModelGatewayError,
  assertProcessingRouteAllowedV1,
  modelInvocationObservationV1Schema,
  modelInvocationRequestV1Schema,
  modelInvocationResultV1Schema,
} from '@meridian/domain';
import type {
  ModelInferencePort,
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelObservationSink,
  ProcessingConsentV1,
} from '@meridian/domain';
import { initialModelRouteV1 } from './model-routing.js';

export interface ModelGatewayServiceDependencies {
  readonly adapter: ModelInferencePort;
  readonly consent: ProcessingConsentV1;
  readonly observations: ModelObservationSink;
}

function failureReason(error: unknown) {
  return error instanceof ModelGatewayError
    ? error.reason
    : ('provider_unavailable' as const);
}

function providerStatusCode(error: unknown): number | null {
  return error instanceof ModelGatewayError ? error.providerStatusCode : null;
}

function assertProductionRouteAllowed(request: ModelInvocationRequest): void {
  if (request.purpose !== 'production') return;
  const route = initialModelRouteV1(request.taskClass);
  if (
    !route.active ||
    route.modelId !== request.modelId ||
    route.outputAuthority !== request.outputAuthority ||
    route.reasoningEffort !== request.reasoningEffort ||
    request.provider !== 'openai'
  )
    throw new ModelGatewayError('configuration_invalid');
}

export class ModelGatewayService {
  public constructor(
    private readonly dependencies: ModelGatewayServiceDependencies,
  ) {}

  public async invoke(
    input: ModelInvocationRequest,
  ): Promise<ModelInvocationResult> {
    const request = modelInvocationRequestV1Schema.parse(input);
    assertProcessingRouteAllowedV1(
      request.processingClass,
      'external_llm',
      this.dependencies.consent,
    );
    const startedAt = performance.now();
    try {
      assertProductionRouteAllowed(request);
      let result: ModelInvocationResult;
      try {
        result = modelInvocationResultV1Schema.parse(
          await this.dependencies.adapter.invoke(request),
        );
      } catch (error) {
        if (error instanceof ModelGatewayError) throw error;
        throw new ModelGatewayError('output_invalid');
      }
      if (
        result.provider !== request.provider ||
        result.modelId !== request.modelId
      )
        throw new ModelGatewayError('output_invalid');
      this.dependencies.observations.observe(
        modelInvocationObservationV1Schema.parse({
          failureReason: null,
          fixtureId: request.fixtureId,
          latencyMilliseconds: result.latencyMilliseconds,
          modelId: result.modelId,
          outcome: 'succeeded',
          promptId: request.promptId,
          promptVersion: request.promptVersion,
          provider: result.provider,
          providerStatusCode: result.providerStatusCode,
          purpose: request.purpose,
          taskClass: request.taskClass,
          usage: result.usage,
        }),
      );
      return result;
    } catch (error) {
      this.dependencies.observations.observe(
        modelInvocationObservationV1Schema.parse({
          failureReason: failureReason(error),
          fixtureId: request.fixtureId,
          latencyMilliseconds: Math.max(
            0,
            Math.round(performance.now() - startedAt),
          ),
          modelId: request.modelId,
          outcome: 'failed',
          promptId: request.promptId,
          promptVersion: request.promptVersion,
          provider: request.provider,
          providerStatusCode: providerStatusCode(error),
          purpose: request.purpose,
          taskClass: request.taskClass,
          usage: null,
        }),
      );
      throw error;
    }
  }
}
