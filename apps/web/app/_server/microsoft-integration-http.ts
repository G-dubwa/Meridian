import {
  microsoftConnectResponseV1Schema,
  microsoftConnectionStatusResponseV1Schema,
  microsoftDisconnectRequestV1Schema,
} from '@meridian/api-contracts';
import type { MicrosoftConnectionStatusView } from '@meridian/application';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function statusResponse(view: MicrosoftConnectionStatusView): NextResponse {
  return jsonNoStore(
    microsoftConnectionStatusResponseV1Schema.parse({
      account: view.account
        ? {
            connectedAt: view.account.connectedAt.toISOString(),
            disconnectedAt: view.account.disconnectedAt?.toISOString() ?? null,
            displayName: view.account.displayName,
            graphPermissions: view.account.graphPermissions,
            id: view.account.id,
            lastRefreshedAt:
              view.account.lastRefreshedAt?.toISOString() ?? null,
            requestedScopes: view.account.requestedScopes,
            status: view.account.status,
          }
        : null,
      configured: view.configured,
      consentRecords: view.consentRecords.map((record) => ({
        action: record.action,
        graphPermissions: record.graphPermissions,
        occurredAt: record.occurredAt.toISOString(),
        requestedScopes: record.requestedScopes,
      })),
      requestedScopes: view.requestedScopes,
    }),
  );
}

export async function getMicrosoftConnection(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    return statusResponse(
      await authenticationRuntime().microsoft.status(scope),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postMicrosoftConnect(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request, true);
    const authorizationUrl =
      await authenticationRuntime().microsoft.beginConnection(scope);
    return jsonNoStore(
      microsoftConnectResponseV1Schema.parse({
        authorizationUrl: authorizationUrl.toString(),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getMicrosoftCallback(
  request: NextRequest,
): Promise<NextResponse> {
  const destination = new URL('/settings/integrations', request.url);
  try {
    const state = request.nextUrl.searchParams.get('state');
    const code = request.nextUrl.searchParams.get('code');
    const providerError = request.nextUrl.searchParams.get('error');
    if (!state || !code || providerError) throw new Error('Callback rejected.');
    await authenticationRuntime().microsoft.completeConnection(state, code);
    destination.searchParams.set('microsoft', 'connected');
  } catch {
    destination.searchParams.set('microsoft', 'failed');
  }
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export async function postMicrosoftDisconnect(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = microsoftDisconnectRequestV1Schema.parse(
      await request.json(),
    );
    return statusResponse(
      await authenticationRuntime().microsoft.disconnect(
        scope,
        input.confirmation,
        context,
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
