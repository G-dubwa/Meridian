import {
  authenticationResponseV1Schema,
  changePasswordRequestV1Schema,
  csrfResponseV1Schema,
  loginRequestV1Schema,
  recoveryLoginRequestV1Schema,
  revokeSessionsRequestV1Schema,
  sessionResponseV1Schema,
} from '@meridian/api-contracts';
import type { SessionGrant } from '@meridian/application';
import { CsrfInvalidError, DomainError, uuidV1Schema } from '@meridian/domain';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { authenticationRuntime } from './composition';

const production = process.env.NODE_ENV === 'production';
const sessionCookieName = production
  ? '__Host-meridian-session'
  : 'meridian-session';
const csrfCookieName = production ? '__Host-meridian-csrf' : 'meridian-csrf';

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
} as const;

function contextFor(request: NextRequest) {
  const runtime = authenticationRuntime();
  const suppliedRequestId = uuidV1Schema.safeParse(
    request.headers.get('x-request-id'),
  );
  const forwardedAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';
  return {
    clientFingerprintHash: runtime.secrets.hash(
      `${forwardedAddress}:${userAgent}`,
    ),
    requestId: suppliedRequestId.success
      ? suppliedRequestId.data
      : runtime.ids.next(),
  };
}

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { headers: noStoreHeaders, status });
}

function setGrantCookies(response: NextResponse, grant: SessionGrant): void {
  response.cookies.set(sessionCookieName, grant.sessionToken, {
    expires: grant.absoluteExpiresAt,
    httpOnly: true,
    path: '/',
    priority: 'high',
    sameSite: 'strict',
    secure: production,
  });
  response.cookies.set(csrfCookieName, grant.csrfToken, {
    expires: grant.absoluteExpiresAt,
    httpOnly: false,
    path: '/',
    priority: 'high',
    sameSite: 'strict',
    secure: production,
  });
}

function clearAuthCookies(response: NextResponse): void {
  const options = {
    expires: new Date(0),
    maxAge: 0,
    path: '/',
    sameSite: 'strict' as const,
    secure: production,
  };
  response.cookies.set(sessionCookieName, '', {
    ...options,
    httpOnly: true,
  });
  response.cookies.set(csrfCookieName, '', {
    ...options,
    httpOnly: false,
  });
}

function requireCsrf(request: NextRequest): string {
  const runtime = authenticationRuntime();
  const cookieToken = request.cookies.get(csrfCookieName)?.value;
  const headerToken = request.headers.get('x-csrf-token');
  if (
    !cookieToken ||
    !headerToken ||
    !runtime.secrets.matches(runtime.secrets.hash(cookieToken), headerToken)
  )
    throw new CsrfInvalidError();
  return headerToken;
}

function requireSessionToken(request: NextRequest): string {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) throw new DomainError('SESSION_INVALID', 'Session required.');
  return token;
}

export function httpErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError)
    return jsonNoStore({ error: 'VALIDATION_FAILED' }, 400);
  if (error instanceof DomainError) {
    const status =
      error.code === 'INTEGRATION_UNAVAILABLE'
        ? 503
        : error.code === 'CSRF_INVALID'
          ? 403
          : error.code === 'RATE_LIMITED'
            ? 429
            : error.code === 'VALIDATION_FAILED'
              ? 400
              : error.code === 'NOT_FOUND'
                ? 404
                : error.code === 'CONFLICT'
                  ? 409
                  : error.code === 'PROHIBITED_ACTION' ||
                      error.code === 'PROCESSING_CLASS_VIOLATION'
                    ? 403
                    : 401;
    const response = jsonNoStore({ error: error.code }, status);
    if (error.code === 'RATE_LIMITED' && 'retryAt' in error) {
      const retryAt = error.retryAt;
      if (retryAt instanceof Date)
        response.headers.set(
          'Retry-After',
          String(
            Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000)),
          ),
        );
    }
    return response;
  }
  return jsonNoStore({ error: 'INTERNAL_ERROR' }, 500);
}

export async function requireAuthenticatedScope(
  request: NextRequest,
  stateChanging = false,
) {
  const csrfToken = stateChanging ? requireCsrf(request) : undefined;
  const session = await authenticationRuntime().service.validateSession(
    requireSessionToken(request),
    csrfToken,
  );
  return {
    context: { correlationId: contextFor(request).requestId },
    scope: { userId: session.record.userId },
  };
}

export function getCsrf(): NextResponse {
  const token = authenticationRuntime().secrets.generate(32);
  const response = jsonNoStore(
    csrfResponseV1Schema.parse({ csrfToken: token }),
  );
  response.cookies.set(csrfCookieName, token, {
    httpOnly: false,
    maxAge: 15 * 60,
    path: '/',
    priority: 'high',
    sameSite: 'strict',
    secure: production,
  });
  return response;
}

export async function postLogin(request: NextRequest): Promise<NextResponse> {
  try {
    requireCsrf(request);
    const input = loginRequestV1Schema.parse(await request.json());
    const grant = await authenticationRuntime().service.login(
      input,
      contextFor(request),
    );
    const response = jsonNoStore(
      authenticationResponseV1Schema.parse({
        absoluteExpiresAt: grant.absoluteExpiresAt.toISOString(),
        authenticated: true,
        idleExpiresAt: grant.idleExpiresAt.toISOString(),
      }),
    );
    setGrantCookies(response, grant);
    return response;
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postRecovery(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    requireCsrf(request);
    const input = recoveryLoginRequestV1Schema.parse(await request.json());
    const grant = await authenticationRuntime().service.recover(
      input,
      contextFor(request),
    );
    const response = jsonNoStore(
      authenticationResponseV1Schema.parse({
        absoluteExpiresAt: grant.absoluteExpiresAt.toISOString(),
        authenticated: true,
        idleExpiresAt: grant.idleExpiresAt.toISOString(),
      }),
    );
    setGrantCookies(response, grant);
    return response;
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getSession(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await authenticationRuntime().service.validateSession(
      requireSessionToken(request),
    );
    return jsonNoStore(
      sessionResponseV1Schema.parse({
        absoluteExpiresAt: session.record.absoluteExpiresAt.toISOString(),
        activeSessionCount: session.activeSessionCount,
        authenticated: true,
        identifier: session.identifier,
        idleExpiresAt: session.record.idleExpiresAt.toISOString(),
      }),
    );
  } catch (error) {
    const response = httpErrorResponse(error);
    clearAuthCookies(response);
    return response;
  }
}

export async function postRenew(request: NextRequest): Promise<NextResponse> {
  try {
    const grant = await authenticationRuntime().service.renewSession(
      requireSessionToken(request),
      requireCsrf(request),
      contextFor(request),
    );
    const response = jsonNoStore(
      authenticationResponseV1Schema.parse({
        absoluteExpiresAt: grant.absoluteExpiresAt.toISOString(),
        authenticated: true,
        idleExpiresAt: grant.idleExpiresAt.toISOString(),
      }),
    );
    setGrantCookies(response, grant);
    return response;
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postLogout(request: NextRequest): Promise<NextResponse> {
  try {
    await authenticationRuntime().service.logout(
      requireSessionToken(request),
      requireCsrf(request),
      contextFor(request),
    );
    const response = new NextResponse(null, {
      headers: noStoreHeaders,
      status: 204,
    });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postChangePassword(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const input = changePasswordRequestV1Schema.parse(await request.json());
    await authenticationRuntime().service.changePassword(
      requireSessionToken(request),
      requireCsrf(request),
      input.currentPassphrase,
      input.newPassphrase,
      contextFor(request),
    );
    return new NextResponse(null, { headers: noStoreHeaders, status: 204 });
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postRevokeSessions(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const input = revokeSessionsRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().service.revokeSessions(
      requireSessionToken(request),
      requireCsrf(request),
      input.includeCurrent,
      contextFor(request),
    );
    const response = new NextResponse(null, {
      headers: noStoreHeaders,
      status: 204,
    });
    if (result.signedOut) clearAuthCookies(response);
    return response;
  } catch (error) {
    return httpErrorResponse(error);
  }
}
