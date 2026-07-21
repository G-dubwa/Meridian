import {
  microsoftConnectResponseV1Schema,
  microsoftConnectionStatusResponseV1Schema,
  microsoftDisconnectRequestV1Schema,
} from '@meridian/api-contracts';
import type { MicrosoftConnectionStatusView } from '@meridian/application';
import {
  MicrosoftCallbackFailedError,
  logMicrosoftCallbackFailure,
} from '@meridian/application';
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
      todoConsent: view.todoConsent,
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

function singleFormValue(form: FormData, key: string): string | null {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === 'string'
    ? values[0]
    : null;
}

export async function postMicrosoftCallback(
  request: NextRequest,
): Promise<NextResponse> {
  const destination = new URL('/settings/integrations', request.url);
  try {
    if (request.nextUrl.search.length > 0)
      throw new Error('Callback rejected.');
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.startsWith('application/x-www-form-urlencoded'))
      throw new Error('Callback rejected.');
    const form = await request.formData();
    const state = singleFormValue(form, 'state');
    const code = singleFormValue(form, 'code');
    const providerError = singleFormValue(form, 'error');
    if (!state || !code || providerError) throw new Error('Callback rejected.');
    await authenticationRuntime().microsoft.completeConnection(state, code);
    destination.searchParams.set('microsoft', 'connected');
  } catch (error) {
    const ownerReviewRequired =
      error instanceof MicrosoftCallbackFailedError &&
      error.diagnostic.failureClass === 'account_continuity_review_required';
    logMicrosoftCallbackFailure(
      console,
      error instanceof MicrosoftCallbackFailedError ? error.diagnostic : null,
    );
    destination.searchParams.set(
      'microsoft',
      ownerReviewRequired ? 'owner-review-required' : 'failed',
    );
  }
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');
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
