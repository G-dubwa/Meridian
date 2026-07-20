import {
  microsoftConnectResponseV1Schema,
  microsoftTodoCleanupRequestV1Schema,
  microsoftTodoConsentRequestV1Schema,
  microsoftTodoFirstDayRequestV1Schema,
  microsoftTodoReconcileRequestV1Schema,
  microsoftTodoStatusResponseV1Schema,
  microsoftTodoSuspendRequestV1Schema,
} from '@meridian/api-contracts';
import { IntegrationUnavailableError } from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
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
  try {
    const { scope } = await requireAuthenticatedScope(request, true);
    microsoftTodoConsentRequestV1Schema.parse(await request.json());
    const authorizationUrl =
      await todoRuntime().microsoft.beginTodoIncrementalConsent(scope);
    return jsonNoStore(
      microsoftConnectResponseV1Schema.parse({
        authorizationUrl: authorizationUrl.toString(),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
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
