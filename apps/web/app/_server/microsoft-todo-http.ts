import {
  microsoftConsentStartFailureV1Schema,
  microsoftConnectResponseV1Schema,
  microsoftTodoCleanupRequestV1Schema,
  microsoftTodoConsentRequestV1Schema,
  microsoftTodoFirstDayRequestV1Schema,
  microsoftTodoReconcileRequestV1Schema,
  microsoftTodoStatusResponseV1Schema,
  microsoftTodoSuspendRequestV1Schema,
} from '@meridian/api-contracts';
import type { MicrosoftConsentStartFailureV1 } from '@meridian/api-contracts';
import {
  DomainError,
  DomainValidationError,
  IntegrationConfigurationInvalidError,
  IntegrationUnavailableError,
  uuidV1Schema,
} from '@meridian/domain';
import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function todoRuntime() {
  const runtime = authenticationRuntime();
  if (!runtime.microsoftTodo || !runtime.microsoftTodoEnablement)
    throw new IntegrationUnavailableError();
  return {
    enablement: runtime.microsoftTodoEnablement,
    microsoft: runtime.microsoft,
    todo: runtime.microsoftTodo,
  };
}

function consentStartCorrelationId(request: NextRequest) {
  const supplied = uuidV1Schema.safeParse(request.headers.get('x-request-id'));
  return supplied.success ? supplied.data : uuidV1Schema.parse(randomUUID());
}

async function parseConsentStartRequest(request: NextRequest): Promise<void> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DomainValidationError('Consent confirmation is invalid.');
  }
  microsoftTodoConsentRequestV1Schema.parse(body);
}

function safeStackFrames(error: unknown): readonly string[] {
  if (!(error instanceof Error) || !error.stack) return [];
  return error.stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, 20);
}

function microsoftConsentStartErrorResponse(
  error: unknown,
  correlationId: string,
): NextResponse {
  let errorCode: MicrosoftConsentStartFailureV1['error'] = 'INTERNAL_ERROR';
  let stage: MicrosoftConsentStartFailureV1['stage'] = 'internal';
  let status = 500;
  if (error instanceof ZodError) {
    errorCode = 'VALIDATION_FAILED';
    stage = 'confirmation';
    status = 400;
  } else if (error instanceof IntegrationConfigurationInvalidError) {
    errorCode = 'CONFLICT';
    stage =
      error.stage === 'microsoft_configuration' ? 'configuration' : error.stage;
    status = 409;
  } else if (error instanceof DomainError) {
    if (error.code === 'VALIDATION_FAILED') {
      errorCode = error.code;
      stage = 'confirmation';
      status = 400;
    } else if (error.code === 'CSRF_INVALID') {
      errorCode = error.code;
      stage = 'csrf';
      status = 403;
    } else if (
      error.code === 'SESSION_INVALID' ||
      error.code === 'AUTHENTICATION_FAILED'
    ) {
      errorCode = error.code;
      stage = 'owner_session';
      status = 401;
    } else if (error.code === 'INTEGRATION_UNAVAILABLE') {
      errorCode = error.code;
      stage = 'configuration';
      status = 409;
    } else if (error.code === 'CONFLICT') {
      errorCode = error.code;
      stage = 'eligibility';
      status = 409;
    }
  }
  const diagnostic = {
    correlationId,
    errorCode,
    exceptionType:
      error instanceof Error ? error.constructor.name : 'UnknownError',
    stage,
    stackFrames: safeStackFrames(error),
    ...(error instanceof IntegrationConfigurationInvalidError &&
    typeof error.details?.databaseCode === 'string'
      ? { databaseCode: error.details.databaseCode }
      : {}),
  };
  if (status === 500)
    console.error('Microsoft consent start failed unexpectedly.', diagnostic);
  else if (stage === 'configuration' || stage === 'oauth_session_persistence')
    console.warn('Microsoft consent start rejected safely.', diagnostic);
  return jsonNoStore(
    microsoftConsentStartFailureV1Schema.parse({
      correlationId,
      error: errorCode,
      stage,
    }),
    status,
  );
}

export async function getMicrosoftTodoStatus(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    return jsonNoStore(
      microsoftTodoStatusResponseV1Schema.parse(
        await todoRuntime().todo.status(scope),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postMicrosoftTodoConsent(
  request: NextRequest,
): Promise<NextResponse> {
  const correlationId = consentStartCorrelationId(request);
  try {
    const { scope } = await requireAuthenticatedScope(request, true);
    await parseConsentStartRequest(request);
    const authorizationUrl =
      await authenticationRuntime().microsoft.beginTodoIncrementalConsent(
        scope,
      );
    return jsonNoStore(
      microsoftConnectResponseV1Schema.parse({
        authorizationUrl: authorizationUrl.toString(),
      }),
    );
  } catch (error) {
    return microsoftConsentStartErrorResponse(error, correlationId);
  }
}

export async function postMicrosoftTodoFirstDay(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request, true);
    const input = microsoftTodoFirstDayRequestV1Schema.parse(
      await request.json(),
    );
    return jsonNoStore(
      microsoftTodoStatusResponseV1Schema.parse(
        await todoRuntime().enablement.createFirstDayTest(
          scope,
          input.reminderAt,
          input.idempotencyKey,
        ),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postMicrosoftTodoReconcile(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    microsoftTodoReconcileRequestV1Schema.parse(await request.json());
    const runtime = todoRuntime();
    await runtime.todo.reconcileExperimentalTask(scope, {
      correlationId: context.correlationId,
      ownerConfirmed: true,
    });
    return jsonNoStore(
      microsoftTodoStatusResponseV1Schema.parse(
        await runtime.todo.status(scope),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postMicrosoftTodoCleanup(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    microsoftTodoCleanupRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      microsoftTodoStatusResponseV1Schema.parse(
        await todoRuntime().todo.cleanupExperimentalObjects(scope, {
          correlationId: context.correlationId,
          ownerConfirmed: true,
        }),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postMicrosoftTodoSuspend(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    microsoftTodoSuspendRequestV1Schema.parse(await request.json());
    const runtime = todoRuntime();
    await runtime.microsoft.disconnect(scope, 'DISCONNECT', context);
    return jsonNoStore(
      microsoftTodoStatusResponseV1Schema.parse(
        await runtime.todo.status(scope),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
