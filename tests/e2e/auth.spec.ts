import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const baseUrl = process.env.AUTH_E2E_BASE_URL;
if (!baseUrl) throw new Error('AUTH_E2E_BASE_URL is required.');

const originalPassphrase = 'correct horse battery meridian';
let currentPassphrase = originalPassphrase;
let recoveryCode = '';

async function csrf(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/auth/csrf');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { csrfToken?: unknown };
  expect(typeof body.csrfToken).toBe('string');
  return String(body.csrfToken);
}

async function csrfCookie(request: APIRequestContext): Promise<string> {
  const storage = await request.storageState();
  const cookie = storage.cookies.find((candidate) =>
    candidate.name.endsWith('meridian-csrf'),
  );
  if (!cookie) throw new Error('CSRF cookie was not set.');
  return cookie.value;
}

async function login(
  request: APIRequestContext,
  passphrase = currentPassphrase,
) {
  const token = await csrf(request);
  return request.post('/api/auth/login', {
    data: { identifier: 'owner', passphrase },
    headers: { 'x-csrf-token': token },
  });
}

test.describe.serial('WP-04 local owner authentication', () => {
  test('bootstraps exactly one owner and stores only Argon2id/recovery hashes', async () => {
    const first = spawnSync(
      'pnpm',
      [
        'auth:bootstrap',
        '--password-stdin',
        '--identifier',
        'owner',
        '--time-zone',
        'Africa/Johannesburg',
        '--locale',
        'en-ZA',
      ],
      {
        encoding: 'utf8',
        env: process.env,
        input: `${originalPassphrase}\n${originalPassphrase}\n`,
      },
    );
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).not.toContain(originalPassphrase);
    const codes = first.stdout.match(/MRD-[A-Z2-9]{8}-[A-Z2-9]{8}/g) ?? [];
    expect(codes).toHaveLength(10);
    recoveryCode = codes[0] ?? '';

    const second = spawnSync(
      'pnpm',
      ['auth:bootstrap', '--password-stdin', '--identifier', 'owner'],
      {
        encoding: 'utf8',
        env: process.env,
        input: `${originalPassphrase}\n${originalPassphrase}\n`,
      },
    );
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('BOOTSTRAP_COMPLETE');
    expect(second.stdout).not.toContain(originalPassphrase);

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [credential] = await sql<
        { password_hash: string; credential_count: string }[]
      >`
        select password_hash,
          (select count(*)::text from auth_credentials) as credential_count
        from auth_credentials
      `;
      expect(credential?.credential_count).toBe('1');
      expect(credential?.password_hash).toMatch(/^\$argon2id\$/);
      expect(credential?.password_hash).not.toContain(originalPassphrase);
      const storedCodes = await sql<{ code_hash: string }[]>`
        select code_hash from recovery_codes
      `;
      expect(storedCodes).toHaveLength(10);
      expect(storedCodes.every((row) => row.code_hash.length === 64)).toBe(
        true,
      );
      expect(storedCodes.some((row) => row.code_hash === recoveryCode)).toBe(
        false,
      );
    } finally {
      await sql.end();
    }
  });

  test('rejects failed login generically, rate-counts it, and enforces CSRF', async ({
    request,
  }) => {
    const missingCsrf = await request.post('/api/auth/login', {
      data: {
        identifier: 'owner',
        passphrase: 'this is deliberately incorrect',
      },
    });
    expect(missingCsrf.status()).toBe(403);

    const token = await csrf(request);
    const failed = await request.post('/api/auth/login', {
      data: {
        identifier: 'owner',
        passphrase: 'this is deliberately incorrect',
      },
      headers: { 'x-csrf-token': token },
    });
    expect(failed.status()).toBe(401);
    const body = await failed.text();
    expect(body).toContain('AUTHENTICATION_FAILED');
    expect(body).not.toContain('this is deliberately incorrect');

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [audit] = await sql<{ count: string }[]>`
        select count(*)::text as count from auth_events
        where event_type = 'login_failed' and outcome = 'rejected'
      `;
      expect(Number(audit?.count ?? 0)).toBeGreaterThanOrEqual(1);
    } finally {
      await sql.end();
    }
  });

  test('logs in with hardened cookies, exposes safe session state, and logs out', async ({
    request,
  }) => {
    const response = await login(request);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(currentPassphrase);

    const storage = await request.storageState();
    const sessionCookie = storage.cookies.find((cookie) =>
      cookie.name.endsWith('meridian-session'),
    );
    expect(sessionCookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
    });

    const session = await request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    expect(await session.json()).toMatchObject({
      activeSessionCount: 1,
      authenticated: true,
      identifier: 'owner',
    });

    const logout = await request.post('/api/auth/logout', {
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(logout.status()).toBe(204);
    expect((await request.get('/api/auth/session')).status()).toBe(401);
  });

  test('renews a session and changes the passphrase while revoking peers', async ({
    request,
  }) => {
    expect((await login(request)).status()).toBe(200);
    const sql = postgres(databaseUrl, { prepare: false });
    try {
      await sql`
        update auth_sessions
        set last_seen_at = now() - interval '10 minutes',
            idle_expires_at = now() + interval '5 minutes',
            absolute_expires_at = now() + interval '10 minutes'
        where revoked_at is null
      `;
      const touched = await request.get('/api/auth/session');
      expect(touched.status()).toBe(200);
      const touchedBody = (await touched.json()) as {
        absoluteExpiresAt: string;
        idleExpiresAt: string;
      };
      expect(Date.parse(touchedBody.idleExpiresAt)).toBeLessThanOrEqual(
        Date.parse(touchedBody.absoluteExpiresAt),
      );
    } finally {
      await sql.end();
    }
    const before = (await request.storageState()).cookies.find((cookie) =>
      cookie.name.endsWith('meridian-session'),
    )?.value;
    const renewed = await request.post('/api/auth/session/renew', {
      data: {},
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(renewed.status()).toBe(200);
    const after = (await request.storageState()).cookies.find((cookie) =>
      cookie.name.endsWith('meridian-session'),
    )?.value;
    expect(after).not.toBe(before);

    const replacement = 'a newer correct horse meridian passphrase';
    const changed = await request.post('/api/auth/password', {
      data: {
        currentPassphrase,
        newPassphrase: replacement,
      },
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(changed.status()).toBe(204);
    currentPassphrase = replacement;
  });

  test('uses a recovery code once without returning recovery material', async ({
    playwright,
  }) => {
    const recoveredContext = await playwright.request.newContext({
      baseURL: baseUrl,
    });
    try {
      const token = await csrf(recoveredContext);
      const recovered = await recoveredContext.post('/api/auth/recovery', {
        data: { identifier: 'owner', recoveryCode },
        headers: { 'x-csrf-token': token },
      });
      expect(recovered.status()).toBe(200);
      expect(await recovered.text()).not.toContain(recoveryCode);
      expect((await recoveredContext.get('/api/auth/session')).status()).toBe(
        200,
      );
    } finally {
      await recoveredContext.dispose();
    }

    const reusedContext = await playwright.request.newContext({
      baseURL: baseUrl,
    });
    try {
      const token = await csrf(reusedContext);
      const reused = await reusedContext.post('/api/auth/recovery', {
        data: { identifier: 'owner', recoveryCode },
        headers: { 'x-csrf-token': token },
      });
      expect(reused.status()).toBe(401);
      expect(await reused.text()).not.toContain(recoveryCode);
    } finally {
      await reusedContext.dispose();
    }
  });

  test('revokes the current session and serves the Security settings surface', async ({
    request,
  }) => {
    expect((await login(request)).status()).toBe(200);
    const settings = await request.get('/settings/security');
    expect(settings.status()).toBe(200);
    expect(await settings.text()).toContain('Security');

    const revoked = await request.post('/api/auth/sessions/revoke', {
      data: { includeCurrent: true },
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(revoked.status()).toBe(204);
    expect((await request.get('/api/auth/session')).status()).toBe(401);
  });

  test('locks the credential after repeated failures without revealing lock state', async ({
    playwright,
  }) => {
    const attacker = await playwright.request.newContext({
      baseURL: baseUrl,
      userAgent: 'meridian-lockout-fixture-a',
    });
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const token = await csrf(attacker);
        const response = await attacker.post('/api/auth/login', {
          data: {
            identifier: 'owner',
            passphrase: 'another deliberately invalid passphrase',
          },
          headers: { 'x-csrf-token': token },
        });
        expect(response.status()).toBe(401);
      }
    } finally {
      await attacker.dispose();
    }

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [credential] = await sql<
        { failed_attempts: number; locked: boolean }[]
      >`
        select failed_attempts, locked_until > now() as locked
        from auth_credentials where identifier = 'owner'
      `;
      expect(credential).toMatchObject({ failed_attempts: 5, locked: true });
    } finally {
      await sql.end();
    }

    const owner = await playwright.request.newContext({
      baseURL: baseUrl,
      userAgent: 'meridian-lockout-fixture-b',
    });
    try {
      const response = await login(owner);
      expect(response.status()).toBe(401);
      expect(await response.text()).toContain('AUTHENTICATION_FAILED');
    } finally {
      await owner.dispose();
    }
  });
});
