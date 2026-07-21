import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import postgres from 'postgres';
import {
  userIdV1Schema,
  uuidV1Schema,
} from '../../packages/domain/src/index.js';
import { createDatabaseClient } from '../../packages/infrastructure-db/src/client.js';
import { DrizzleTransactionManager } from '../../packages/infrastructure-db/src/transaction-manager.js';

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

test.describe.serial('WP-04 through WP-11 authenticated acceptance', () => {
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

  test('keeps Private evidence outside AI and preflights guarded Microsoft consent locally', async ({
    request,
  }) => {
    expect((await request.get('/api/system/worker-health')).status()).toBe(401);
    expect((await request.get('/api/integrations/microsoft')).status()).toBe(
      401,
    );
    expect(
      (await request.get('/api/integrations/microsoft/todo')).status(),
    ).toBe(401);
    expect((await request.get('/api/triage/proposals')).status()).toBe(401);
    expect((await login(request)).status()).toBe(200);
    const standardBody = 'First standard journal evidence.';
    const revisedBody = 'Revised standard journal evidence.';
    const privateBody = 'Private journal evidence never leaves local display.';

    const standardCreated = await request.post('/api/journal/entries', {
      data: { bodyMarkdown: standardBody, processingClass: 'standard' },
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(standardCreated.status()).toBe(201);
    const standard = (await standardCreated.json()) as {
      entry: { id: string; version: number };
    };

    const revised = await request.post(
      `/api/journal/entries/${standard.entry.id}/revisions`,
      {
        data: {
          bodyMarkdown: revisedBody,
          expectedVersion: standard.entry.version,
          processingClass: 'standard',
        },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(revised.status()).toBe(200);
    const revisedView = (await revised.json()) as {
      entry: { version: number };
      revisions: { bodyMarkdown: string; id: string; revisionNumber: number }[];
    };
    expect(revisedView.revisions).toEqual([
      expect.objectContaining({
        bodyMarkdown: standardBody,
        revisionNumber: 1,
      }),
      expect.objectContaining({ bodyMarkdown: revisedBody, revisionNumber: 2 }),
    ]);

    const detail = await request.get(
      `/api/journal/entries/${standard.entry.id}`,
    );
    expect(detail.status()).toBe(200);
    expect(
      ((await detail.json()) as { revisions: unknown[] }).revisions,
    ).toHaveLength(2);

    const configuredExtraction = await request.post(
      `/api/journal/revisions/${revisedView.revisions[1]?.id ?? ''}/triage-proposals`,
      {
        data: { ownerConfirmedExternalProcessing: true },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(configuredExtraction.status()).toBe(503);
    expect(await configuredExtraction.json()).toEqual({
      error: 'INTEGRATION_UNAVAILABLE',
    });

    const privateCreated = await request.post('/api/journal/entries', {
      data: { bodyMarkdown: privateBody, processingClass: 'private' },
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(privateCreated.status()).toBe(201);
    const privateView = (await privateCreated.json()) as {
      entry: { id: string };
    };

    const sql = postgres(databaseUrl, { prepare: false });
    const database = createDatabaseClient(databaseUrl);
    try {
      const [credential] = await sql<{ user_id: string }[]>`
        select user_id from auth_credentials where identifier = 'owner'
      `;
      if (!credential) throw new Error('Owner fixture is missing.');
      const scope = { userId: userIdV1Schema.parse(credential.user_id) };
      const eligible = await new DrizzleTransactionManager(
        database.database,
      ).run(scope, (ports) =>
        ports.entryRevisions.findCurrentForAiProcessing(scope, 20),
      );
      expect(eligible.map((revision) => revision.entryId)).toEqual([
        standard.entry.id,
      ]);
      expect(
        eligible.some((revision) => revision.entryId === privateView.entry.id),
      ).toBe(false);

      const [audit] = await sql<
        { body_leaks: string; events: string; messages: string }[]
      >`
        select
          (select count(*)::text from domain_events where payload::text like ${`%${privateBody}%`}) as body_leaks,
          (select count(*)::text from domain_events where event_type like 'journal.%') as events,
          (select count(*)::text from outbox_messages where topic like 'journal.%') as messages
      `;
      expect(audit).toEqual({ body_leaks: '0', events: '3', messages: '3' });
    } finally {
      await database.sql.end();
      await sql.end();
    }

    const journalPage = await request.get('/journal');
    expect(journalPage.status()).toBe(200);
    expect(await journalPage.text()).toContain('Journal');
    const triageApi = await request.get('/api/triage/proposals');
    expect(triageApi.status()).toBe(200);
    expect(await triageApi.json()).toEqual({ proposals: [] });
    const triagePage = await request.get('/triage');
    expect(triagePage.status()).toBe(200);
    expect(await triagePage.text()).toContain('Triage');
    const detailPage = await request.get(`/journal/${standard.entry.id}`);
    expect(detailPage.status()).toBe(200);
    expect(await detailPage.text()).toContain('Entry detail');

    const archived = await request.post(
      `/api/journal/entries/${standard.entry.id}/archive`,
      {
        data: { expectedVersion: revisedView.entry.version },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(archived.status()).toBe(200);
    const archivedView = (await archived.json()) as {
      entry: { status: string; version: number };
    };
    expect(archivedView.entry.status).toBe('archived');

    const deletion = await request.post(
      `/api/journal/entries/${standard.entry.id}/deletion-request`,
      {
        data: {
          confirmHardDeletion: true,
          expectedVersion: archivedView.entry.version,
        },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(deletion.status()).toBe(200);
    expect(
      ((await deletion.json()) as { entry: { status: string } }).entry.status,
    ).toBe('deletion_requested');

    const activity = await request.get('/api/journal/activity');
    expect(activity.status()).toBe(200);
    expect(
      ((await activity.json()) as { activity: unknown[] }).activity,
    ).toHaveLength(5);

    const workerHealth = await request.get('/api/system/worker-health');
    expect(workerHealth.status()).toBe(200);
    expect(await workerHealth.json()).toMatchObject({
      deadLetters: [],
      failed: 0,
      inFlight: 0,
      pending: 5,
      succeeded: 0,
      uncertain: 0,
    });
    const healthPage = await request.get('/settings/health');
    expect(healthPage.status()).toBe(200);
    expect(await healthPage.text()).toContain('System health');

    const microsoftStatus = await request.get('/api/integrations/microsoft');
    expect(microsoftStatus.status()).toBe(200);
    expect(await microsoftStatus.json()).toMatchObject({
      account: null,
      configured: true,
      consentRecords: [],
      requestedScopes: [
        'openid',
        'profile',
        'offline_access',
        'User.Read',
        'Calendars.Read',
      ],
    });
    const connectPreflight = await request.post('/api/integrations/microsoft', {
      data: {},
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(connectPreflight.status()).toBe(200);
    const connectBody = (await connectPreflight.json()) as {
      authorizationUrl?: unknown;
    };
    expect(typeof connectBody.authorizationUrl).toBe('string');
    const connectUrl = new URL(String(connectBody.authorizationUrl));
    expect(connectUrl.origin).toBe('https://login.microsoftonline.com');
    expect(connectUrl.searchParams.get('scope')?.split(' ')).toEqual([
      'openid',
      'profile',
      'offline_access',
      'User.Read',
      'Calendars.Read',
    ]);
    expect(connectUrl.searchParams.get('state')?.length).toBeGreaterThanOrEqual(
      32,
    );
    expect(connectUrl.searchParams.get('nonce')?.length).toBeGreaterThanOrEqual(
      32,
    );

    const ineligibleTodo = await request.post(
      '/api/integrations/microsoft/todo/consent',
      {
        data: { confirmation: 'ENABLE WP11 TODO CONSENT' },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(ineligibleTodo.status()).toBe(409);
    expect(await ineligibleTodo.json()).toMatchObject({
      error: 'CONFLICT',
      stage: 'eligibility',
    });

    const microsoftDatabase = createDatabaseClient(databaseUrl);
    const microsoftSql = postgres(databaseUrl, { prepare: false });
    try {
      const [credential] = await microsoftSql<{ user_id: string }[]>`
        select user_id from auth_credentials where identifier = 'owner'
      `;
      if (!credential) throw new Error('Owner fixture is missing.');
      const scope = { userId: userIdV1Schema.parse(credential.user_id) };
      const occurredAt = new Date('2026-07-18T20:21:08.715Z');
      await new DrizzleTransactionManager(microsoftDatabase.database).run(
        scope,
        async (ports) => {
          await ports.integrationAccounts.save({
            accessTokenCiphertext: null,
            connectedAt: occurredAt,
            createdAt: occurredAt,
            disconnectedAt: new Date('2026-07-18T20:22:55.067Z'),
            displayName: 'Synthetic Microsoft Owner',
            graphPermissions: ['User.Read', 'Calendars.Read'],
            id: uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01980'),
            lastRefreshedAt: null,
            provider: 'microsoft',
            providerSubjectId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
            refreshTokenCiphertext: null,
            requestedScopes: [
              'openid',
              'profile',
              'offline_access',
              'User.Read',
              'Calendars.Read',
            ],
            scope,
            status: 'disconnected',
            tokenExpiresAt: null,
            tokenKeyVersion: 1,
            updatedAt: new Date('2026-07-18T20:22:55.067Z'),
          });
          await ports.consentRecords.append({
            action: 'granted',
            graphPermissions: ['User.Read', 'Calendars.Read'],
            id: uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01982'),
            integrationAccountId: uuidV1Schema.parse(
              '018f0f77-34f1-7ef2-8ca1-7a3bf7f01980',
            ),
            occurredAt,
            provider: 'microsoft',
            requestedScopes: [
              'openid',
              'profile',
              'offline_access',
              'User.Read',
              'Calendars.Read',
            ],
            scope,
          });
        },
      );

      const missingCsrf = await request.post(
        '/api/integrations/microsoft/todo/consent',
        { data: { confirmation: 'ENABLE WP11 TODO CONSENT' } },
      );
      expect(missingCsrf.status()).toBe(403);
      expect(await missingCsrf.json()).toMatchObject({
        error: 'CSRF_INVALID',
        stage: 'csrf',
      });

      const invalidConfirmation = await request.post(
        '/api/integrations/microsoft/todo/consent',
        {
          data: { confirmation: 'CONNECT' },
          headers: { 'x-csrf-token': await csrfCookie(request) },
        },
      );
      expect(invalidConfirmation.status()).toBe(400);
      expect(await invalidConfirmation.json()).toMatchObject({
        error: 'VALIDATION_FAILED',
        stage: 'confirmation',
      });

      const malformedConfirmation = await request.post(
        '/api/integrations/microsoft/todo/consent',
        {
          data: '{',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': await csrfCookie(request),
          },
        },
      );
      expect(malformedConfirmation.status()).toBe(400);
      expect(await malformedConfirmation.json()).toMatchObject({
        error: 'VALIDATION_FAILED',
        stage: 'confirmation',
      });

      const todoPreflight = await request.post(
        '/api/integrations/microsoft/todo/consent',
        {
          data: { confirmation: 'ENABLE WP11 TODO CONSENT' },
          headers: { 'x-csrf-token': await csrfCookie(request) },
        },
      );
      expect(todoPreflight.status()).toBe(200);
      const todoBody = (await todoPreflight.json()) as {
        authorizationUrl?: unknown;
      };
      expect(typeof todoBody.authorizationUrl).toBe('string');
      const todoUrl = new URL(String(todoBody.authorizationUrl));
      expect(todoUrl.origin).toBe('https://login.microsoftonline.com');
      expect(todoUrl.searchParams.get('scope')?.split(' ')).toEqual([
        'openid',
        'profile',
        'offline_access',
        'User.Read',
        'Calendars.Read',
        'Tasks.ReadWrite',
      ]);
      expect(todoUrl.searchParams.get('response_mode')).toBe('form_post');
      expect(todoUrl.searchParams.get('state')?.length).toBeGreaterThanOrEqual(
        32,
      );
      expect(todoUrl.searchParams.get('nonce')?.length).toBeGreaterThanOrEqual(
        32,
      );

      const [beforeStaleSchema] = await microsoftSql<{ count: string }[]>`
        select count(*)::text as count from oauth_authorization_sessions
      `;
      await microsoftSql`
        alter table oauth_authorization_sessions drop column nonce_hash
      `;
      const staleSchema = await request.post(
        '/api/integrations/microsoft/todo/consent',
        {
          data: { confirmation: 'ENABLE WP11 TODO CONSENT' },
          headers: { 'x-csrf-token': await csrfCookie(request) },
        },
      );
      expect(staleSchema.status()).toBe(409);
      expect(await staleSchema.json()).toMatchObject({
        error: 'CONFLICT',
        stage: 'oauth_session_persistence',
      });
      const [afterStaleSchema] = await microsoftSql<{ count: string }[]>`
        select count(*)::text as count from oauth_authorization_sessions
      `;
      expect(afterStaleSchema?.count).toBe(beforeStaleSchema?.count);
    } finally {
      await microsoftDatabase.sql.end();
      await microsoftSql.end();
    }
    const integrationsPage = await request.get('/settings/integrations');
    expect(integrationsPage.status()).toBe(200);
    expect(await integrationsPage.text()).toContain('Integrations and consent');
  });

  test('creates internal task and reminder receipts with Edit and Undo but no delivery', async ({
    request,
  }) => {
    expect((await request.get('/api/actions')).status()).toBe(401);
    expect((await login(request)).status()).toBe(200);
    const actionsPage = await request.get('/actions');
    expect(actionsPage.status()).toBe(200);
    expect(await actionsPage.text()).toContain('Internal action ledger');
    const noCsrf = await request.post('/api/actions/tasks', {
      data: {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        dueAt: null,
        estimateMinutes: null,
        goalResourceId: null,
        kind: 'task',
        notes: '',
        title: 'Must not be created',
      },
    });
    expect(noCsrf.status()).toBe(403);

    const taskCreated = await request.post('/api/actions/tasks', {
      data: {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        dueAt: null,
        estimateMinutes: 20,
        goalResourceId: null,
        kind: 'task',
        notes: 'E2E private action detail',
        title: 'E2E internal task',
      },
      headers: { 'x-csrf-token': await csrfCookie(request) },
    });
    expect(taskCreated.status()).toBe(201);
    const taskReceipt = (await taskCreated.json()) as {
      receipt: { id: string; status: string; version: number };
      target: { targetType: 'task'; task: { version: number } };
    };
    expect(taskReceipt).toMatchObject({
      receipt: { status: 'active' },
      target: { targetType: 'task' },
    });
    const taskEdited = await request.post(
      `/api/actions/receipts/${taskReceipt.receipt.id}/task`,
      {
        data: {
          dueAt: null,
          estimateMinutes: 25,
          expectedReceiptVersion: taskReceipt.receipt.version,
          expectedTargetVersion: taskReceipt.target.task.version,
          kind: 'commitment',
          notes: 'E2E private action detail',
          ownerConfirmed: true,
          title: 'E2E edited internal task',
        },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(taskEdited.status()).toBe(200);
    const taskUndone = await request.post(
      `/api/actions/receipts/${taskReceipt.receipt.id}/undo`,
      {
        data: {
          expectedVersion: taskReceipt.receipt.version,
          ownerConfirmed: true,
        },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(taskUndone.status()).toBe(200);
    expect(await taskUndone.json()).toMatchObject({
      receipt: { status: 'undone' },
      target: { task: { state: 'dropped' }, targetType: 'task' },
    });

    const reminderCreated = await request.post(
      '/api/actions/commands/reminder',
      {
        data: {
          command: 'Remind me tomorrow at 15:00 to run the E2E reminder',
          ownerConfirmed: true,
          timeZone: 'Africa/Johannesburg',
        },
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(reminderCreated.status()).toBe(201);
    expect(await reminderCreated.json()).toMatchObject({
      receipt: { status: 'active', targetType: 'reminder' },
      target: {
        reminder: { deliveryPolicy: 'undecided', state: 'scheduled' },
        targetType: 'reminder',
      },
    });
    const list = await request.get('/api/actions');
    expect(list.status()).toBe(200);
    expect(await list.json()).toMatchObject({
      reminders: [expect.objectContaining({ deliveryPolicy: 'undecided' })],
      tasks: [expect.objectContaining({ state: 'dropped' })],
    });

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [audit] = await sql<
        { body_leaks: string; external_rows: string }[]
      >`
        select
          count(*) filter (
            where payload::text like '%E2E internal%'
               or payload::text like '%E2E reminder%'
          )::text as body_leaks,
          count(*) filter (
            where event_type like 'integration.%'
          )::text as external_rows
        from domain_events
        where event_type like 'action.%'
      `;
      expect(audit).toEqual({ body_leaks: '0', external_rows: '0' });
    } finally {
      await sql.end();
    }
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
