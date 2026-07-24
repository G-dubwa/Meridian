import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import postgres from 'postgres';
import { userIdV1Schema } from '../../packages/domain/src/index.js';
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

test.describe.serial('WP-04 through WP-18 authenticated acceptance', () => {
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

  test('creates and revises Standard evidence while keeping Private evidence outside AI queries', async ({
    request,
  }) => {
    expect((await request.get('/api/system/worker-health')).status()).toBe(401);
    expect((await request.get('/api/integrations/microsoft')).status()).toBe(
      401,
    );
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
      configured: false,
      consentRecords: [],
      requestedScopes: [
        'openid',
        'profile',
        'offline_access',
        'User.Read',
        'Calendars.Read',
      ],
    });
    const connectWithoutEnvironment = await request.post(
      '/api/integrations/microsoft',
      {
        data: {},
        headers: { 'x-csrf-token': await csrfCookie(request) },
      },
    );
    expect(connectWithoutEnvironment.status()).toBe(503);
    expect(await connectWithoutEnvironment.json()).toEqual({
      error: 'INTEGRATION_UNAVAILABLE',
    });
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

  test('uses local Today priorities, agenda, completion, dismissal, and undo without a provider', async ({
    request,
  }) => {
    const localDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Africa/Johannesburg',
    });
    const timeZone = 'Africa/Johannesburg';
    const query = new URLSearchParams({ date: localDate, timeZone });
    expect((await request.get(`/api/today?${query.toString()}`)).status()).toBe(
      401,
    );
    expect((await login(request)).status()).toBe(200);
    const csrfToken = await csrfCookie(request);
    const todayPage = await request.get('/today');
    expect(todayPage.status()).toBe(200);
    expect(await todayPage.text()).toContain('Local Alpha');

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
        estimateMinutes: 15,
        goalResourceId: null,
        kind: 'task',
        notes: 'E2E Today private notes',
        title: 'E2E Today task',
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(taskCreated.status()).toBe(201);
    const taskBody = (await taskCreated.json()) as {
      target: {
        task: { id: string; version: number };
        targetType: 'task';
      };
    };

    const noCsrf = await request.post('/api/today/priorities', {
      data: {
        localDate,
        ownerConfirmed: true,
        position: 1,
        taskId: taskBody.target.task.id,
      },
    });
    expect(noCsrf.status()).toBe(403);
    const priority = await request.post('/api/today/priorities', {
      data: {
        localDate,
        ownerConfirmed: true,
        position: 1,
        taskId: taskBody.target.task.id,
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(priority.status()).toBe(201);

    const start = new Date(Date.now() + 60 * 60 * 1_000);
    const end = new Date(start.getTime() + 60 * 60 * 1_000);
    const agenda = await request.post('/api/today/agenda', {
      data: {
        endsAt: end.toISOString(),
        notes: 'E2E Today private agenda notes',
        ownerConfirmed: true,
        startsAt: start.toISOString(),
        timeZone,
        title: 'E2E Today agenda',
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(agenda.status()).toBe(201);

    const reminderCreated = await request.post('/api/actions/reminders', {
      data: {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        expiresAt: null,
        priority: 'normal',
        purpose: 'E2E Today reminder',
        recurrence: null,
        relatedResourceId: null,
        timeZone,
        triggerAt: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(reminderCreated.status()).toBe(201);
    const reminderBody = (await reminderCreated.json()) as {
      target: {
        reminder: { id: string; version: number };
        targetType: 'reminder';
      };
    };

    const snapshot = await request.get(`/api/today?${query.toString()}`);
    expect(snapshot.status()).toBe(200);
    expect(await snapshot.json()).toMatchObject({
      channel: { externalDeliveryActive: false, status: 'inactive' },
      priorities: [
        expect.objectContaining({ taskId: taskBody.target.task.id }),
      ],
      reminders: [
        expect.objectContaining({
          reminder: expect.objectContaining({
            deliveryPolicy: 'undecided',
            id: reminderBody.target.reminder.id,
          }),
        }),
      ],
      tasks: [
        expect.objectContaining({
          task: expect.objectContaining({ id: taskBody.target.task.id }),
        }),
      ],
    });

    const completed = await request.post(
      `/api/today/tasks/${taskBody.target.task.id}/complete`,
      {
        data: {
          expectedVersion: taskBody.target.task.version,
          ownerConfirmed: true,
        },
        headers: { 'x-csrf-token': csrfToken },
      },
    );
    expect(completed.status()).toBe(200);
    const completionReceipt = (await completed.json()) as {
      id: string;
      status: string;
      version: number;
    };
    expect(completionReceipt.status).toBe('active');
    const undo = await request.post(
      `/api/today/receipts/${completionReceipt.id}/undo`,
      {
        data: {
          expectedVersion: completionReceipt.version,
          ownerConfirmed: true,
        },
        headers: { 'x-csrf-token': csrfToken },
      },
    );
    expect(undo.status()).toBe(200);
    expect(await undo.json()).toMatchObject({ status: 'undone' });

    const dismissed = await request.post(
      `/api/today/reminders/${reminderBody.target.reminder.id}/dismiss`,
      {
        data: {
          expectedVersion: reminderBody.target.reminder.version,
          ownerConfirmed: true,
        },
        headers: { 'x-csrf-token': csrfToken },
      },
    );
    expect(dismissed.status()).toBe(200);

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [audit] = await sql<
        { content_leaks: string; provider_events: string }[]
      >`
        select
          count(*) filter (
            where payload::text like '%E2E Today%'
          )::text as content_leaks,
          count(*) filter (
            where event_type like 'integration.%'
               or event_type like 'calendar.%'
               or event_type like 'delivery.%'
          )::text as provider_events
        from domain_events
        where event_type like 'today.%'
      `;
      expect(audit).toEqual({ content_leaks: '0', provider_events: '0' });
    } finally {
      await sql.end();
    }
  });

  test('manages local goals, dependency guidance, and acknowledged soft load without a provider', async ({
    request,
  }) => {
    expect((await request.get('/api/goals')).status()).toBe(401);
    expect((await login(request)).status()).toBe(200);
    const csrfToken = await csrfCookie(request);
    const page = await request.get('/goals');
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain('Personal Beta · local');

    const goalInput = (title: string) => ({
      lifeDomain: 'E2E local domain',
      narrative: `${title} private narrative`,
      ownerConfirmed: true,
      successCriteria: `${title} private criterion`,
      targetDate: null,
      title,
      type: 'outcome',
    });
    expect(
      (
        await request.post('/api/goals', {
          data: goalInput('E2E rejected goal'),
        })
      ).status(),
    ).toBe(403);
    const firstResponse = await request.post('/api/goals', {
      data: goalInput('E2E local goal one'),
      headers: { 'x-csrf-token': csrfToken },
    });
    const secondResponse = await request.post('/api/goals', {
      data: goalInput('E2E local goal two'),
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(firstResponse.status()).toBe(201);
    expect(secondResponse.status()).toBe(201);
    const first = (await firstResponse.json()) as {
      id: string;
      resourceId: string;
      version: number;
    };
    const second = (await secondResponse.json()) as {
      id: string;
      resourceId: string;
      version: number;
    };

    const activate = (
      id: string,
      version: number,
      acknowledgeActiveLimit: boolean,
    ) =>
      request.post(`/api/goals/${id}/transition`, {
        data: {
          acknowledgeActiveLimit,
          expectedVersion: version,
          mergedIntoGoalId: null,
          nextState: 'active',
          ownerConfirmed: true,
        },
        headers: { 'x-csrf-token': csrfToken },
      });
    const firstActiveResponse = await activate(first.id, first.version, false);
    expect(firstActiveResponse.status()).toBe(200);
    const firstActive = (await firstActiveResponse.json()) as {
      version: number;
    };
    expect(
      (
        await request.post('/api/goals/load-limit', {
          data: { ownerConfirmed: true, softActiveGoalLimit: 1 },
          headers: { 'x-csrf-token': csrfToken },
        })
      ).status(),
    ).toBe(200);
    expect((await activate(second.id, second.version, false)).status()).toBe(
      409,
    );
    expect((await activate(second.id, second.version, true)).status()).toBe(
      200,
    );

    const edgeResponse = await request.post('/api/goals/edges', {
      data: {
        edgeType: 'depends_on',
        ownerConfirmed: true,
        sourceResourceId: second.resourceId,
        targetResourceId: first.resourceId,
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(edgeResponse.status()).toBe(201);
    const blocked = await request.get('/api/goals');
    expect(blocked.status()).toBe(200);
    expect(await blocked.json()).toMatchObject({
      blockers: [
        {
          blockingResourceIds: [first.resourceId],
          goalResourceId: second.resourceId,
        },
      ],
      guidance: {
        activeCount: 2,
        limit: 1,
        overBy: 1,
        status: 'over_limit',
      },
    });

    const completed = await request.post(`/api/goals/${first.id}/transition`, {
      data: {
        acknowledgeActiveLimit: false,
        expectedVersion: firstActive.version,
        mergedIntoGoalId: null,
        nextState: 'completed',
        ownerConfirmed: true,
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(completed.status()).toBe(200);
    expect(await (await request.get('/api/goals')).json()).toMatchObject({
      blockers: [],
    });

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [audit] = await sql<
        { content_leaks: string; provider_events: string }[]
      >`
        select
          count(*) filter (
            where payload::text like '%E2E local%'
          )::text as content_leaks,
          count(*) filter (
            where event_type like 'integration.%'
               or event_type like 'calendar.%'
               or event_type like 'delivery.%'
          )::text as provider_events
        from domain_events
        where event_type like 'goal.%'
      `;
      expect(audit).toEqual({ content_leaks: '0', provider_events: '0' });
    } finally {
      await sql.end();
    }
  });

  test('previews and accepts exact local planning blocks without provider activity', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: baseUrl,
      userAgent: 'meridian-planning-fixture',
    });
    expect((await request.get('/api/planning')).status()).toBe(401);
    expect((await login(request)).status()).toBe(200);
    const csrfToken = await csrfCookie(request);
    const page = await request.get('/planning');
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain('deterministic · local');

    const taskResponse = await request.post('/api/actions/tasks', {
      data: {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        dueAt: null,
        estimateMinutes: 120,
        goalResourceId: null,
        kind: 'task',
        notes: 'E2E scheduling private notes',
        title: 'E2E scheduling target',
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(taskResponse.status()).toBe(201);
    const taskBody = (await taskResponse.json()) as {
      target: { task: { id: string } };
    };
    const input = {
      bufferMinutes: 15,
      deadline: '2099-07-26T14:00:00.000Z',
      earliestStart: '2099-07-26T08:00:00.000Z',
      estimatedEffortMinutes: 120,
      goalId: null,
      maxBlockMinutes: 60,
      maxDeepWorkMinutesPerDay: 180,
      minBlockMinutes: 30,
      ownerConfirmed: true,
      taskId: taskBody.target.task.id,
      timeZone: 'Africa/Johannesburg',
      title: 'E2E private planning label',
      workingWindows: [
        {
          endsAt: '2099-07-26T14:00:00.000Z',
          startsAt: '2099-07-26T08:00:00.000Z',
        },
      ],
    };
    expect(
      (await request.post('/api/planning', { data: input })).status(),
    ).toBe(403);
    const response = await request.post('/api/planning', {
      data: input,
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(response.status()).toBe(201);
    const proposal = (await response.json()) as {
      candidates: unknown[];
      id: string;
      state: string;
      verdict: string;
      version: number;
    };
    expect(proposal).toMatchObject({
      state: 'pending',
      verdict: 'feasible',
    });
    expect(proposal.candidates).toHaveLength(2);
    const accepted = await request.post(`/api/planning/${proposal.id}/accept`, {
      data: {
        expectedVersion: proposal.version,
        ownerConfirmed: true,
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toMatchObject({ state: 'accepted' });
    expect(await (await request.get('/api/planning')).json()).toMatchObject({
      blocks: [{ state: 'planned' }, { state: 'planned' }],
      providerStatus: 'not_configured',
    });

    const sql = postgres(databaseUrl, { prepare: false });
    try {
      const [audit] = await sql<
        { content_leaks: string; provider_events: string }[]
      >`
        select
          count(*) filter (
            where payload::text like '%E2E private%'
          )::text as content_leaks,
          count(*) filter (
            where event_type like 'integration.%'
               or event_type like 'delivery.%'
          )::text as provider_events
        from domain_events
        where event_type like 'scheduling.%'
      `;
      expect(audit).toEqual({ content_leaks: '0', provider_events: '0' });
    } finally {
      await sql.end();
    }
    await request.dispose();
  });

  test('records owner-confirmed execution and a local Weekly without inferring elapsed work', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: baseUrl,
      userAgent: 'meridian-execution-fixture',
    });
    expect((await request.get('/api/execution/weekly')).status()).toBe(401);
    expect((await login(request)).status()).toBe(200);
    const csrfToken = await csrfCookie(request);
    const page = await request.get('/weekly');
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain('evidence, not inference');

    const taskResponse = await request.post('/api/actions/tasks', {
      data: {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        dueAt: null,
        estimateMinutes: 120,
        goalResourceId: null,
        kind: 'task',
        notes: 'E2E execution private notes',
        title: 'E2E execution target',
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(taskResponse.status()).toBe(201);
    const task = (await taskResponse.json()) as {
      target: { task: { id: string } };
    };
    const proposalResponse = await request.post('/api/planning', {
      data: {
        bufferMinutes: 15,
        deadline: '2099-08-02T14:00:00.000Z',
        earliestStart: '2099-08-02T08:00:00.000Z',
        estimatedEffortMinutes: 120,
        goalId: null,
        maxBlockMinutes: 60,
        maxDeepWorkMinutesPerDay: 180,
        minBlockMinutes: 30,
        ownerConfirmed: true,
        taskId: task.target.task.id,
        timeZone: 'Africa/Johannesburg',
        title: 'E2E execution private plan',
        workingWindows: [
          {
            endsAt: '2099-08-02T14:00:00.000Z',
            startsAt: '2099-08-02T08:00:00.000Z',
          },
        ],
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(proposalResponse.status()).toBe(201);
    const proposal = (await proposalResponse.json()) as {
      id: string;
      version: number;
    };
    expect(
      (
        await request.post(`/api/planning/${proposal.id}/accept`, {
          data: {
            expectedVersion: proposal.version,
            ownerConfirmed: true,
          },
          headers: { 'x-csrf-token': csrfToken },
        })
      ).status(),
    ).toBe(200);
    const planning = (await (await request.get('/api/planning')).json()) as {
      blocks: { id: string; proposalId: string; version: number }[];
    };
    const testBlocks = planning.blocks.filter(
      (block) => block.proposalId === proposal.id,
    );
    const blockIds = testBlocks.map((block) => block.id);
    expect(blockIds).toHaveLength(2);

    const now = new Date();
    const firstStartsAt = new Date(now.getTime() - 180 * 60_000);
    const firstEndsAt = new Date(now.getTime() - 120 * 60_000);
    const secondStartsAt = new Date(now.getTime() - 105 * 60_000);
    const secondEndsAt = new Date(now.getTime() - 45 * 60_000);
    const sql = postgres(databaseUrl, { prepare: false });
    try {
      await sql`
        update calendar_blocks
        set original_starts_at = ${firstStartsAt},
            original_ends_at = ${firstEndsAt},
            current_starts_at = ${firstStartsAt},
            current_ends_at = ${firstEndsAt},
            updated_at = now()
        where id = ${blockIds[0] ?? ''}
      `;
      await sql`
        update calendar_blocks
        set original_starts_at = ${secondStartsAt},
            original_ends_at = ${secondEndsAt},
            current_starts_at = ${secondStartsAt},
            current_ends_at = ${secondEndsAt},
            updated_at = now()
        where id = ${blockIds[1] ?? ''}
      `;

      const noCsrf = await request.post(
        `/api/execution/blocks/${blockIds[0] ?? ''}/respond`,
        {
          data: {
            expectedBlockVersion: 1,
            ownerConfirmed: true,
            reportedDurationMinutes: 30,
            response: 'partly_done',
          },
        },
      );
      expect(noCsrf.status()).toBe(403);
      const noOwnerConfirmation = await request.post(
        `/api/execution/blocks/${blockIds[0] ?? ''}/respond`,
        {
          data: {
            expectedBlockVersion: 1,
            ownerConfirmed: false,
            reportedDurationMinutes: 30,
            response: 'partly_done',
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(noOwnerConfirmation.status()).toBe(400);
      const confirmed = await request.post(
        `/api/execution/blocks/${blockIds[0] ?? ''}/respond`,
        {
          data: {
            expectedBlockVersion: 1,
            ownerConfirmed: true,
            reportedDurationMinutes: 30,
            response: 'partly_done',
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(confirmed.status()).toBe(201);
      expect(await confirmed.json()).toMatchObject({
        confidenceClass: 'owner_confirmed',
        evidenceType: 'post_block_confirmed',
        outcome: 'confirmed_partial',
        reportedDurationMinutes: 30,
      });
      const reconciled = await request.post('/api/execution/reconcile', {
        data: { through: now.toISOString() },
        headers: { 'x-csrf-token': csrfToken },
      });
      expect(reconciled.status()).toBe(200);
      expect(await reconciled.json()).toEqual({ recorded: 1 });

      const localDate = firstStartsAt.toLocaleDateString('en-CA', {
        timeZone: 'Africa/Johannesburg',
      });
      const localDay = new Date(`${localDate}T00:00:00.000Z`);
      const day = localDay.getUTCDay() === 0 ? 7 : localDay.getUTCDay();
      localDay.setUTCDate(localDay.getUTCDate() - day + 1);
      const weekStartsOn = localDay.toISOString().slice(0, 10);
      const query = new URLSearchParams({
        timeZone: 'Africa/Johannesburg',
        weekStartsOn,
      });
      const weekly = await request.get(
        `/api/execution/weekly?${query.toString()}`,
      );
      expect(weekly.status()).toBe(200);
      expect(await weekly.json()).toMatchObject({
        confirmedCompletedMinutes: 0,
        confirmedPartialMinutes: 30,
        plannedMinutes: 120,
        unknownElapsedMinutes: 60,
      });

      const [audit] = await sql<
        {
          content_leaks: string;
          provider_events: string;
          unknown_confidence: string;
        }[]
      >`
        select
          (
            select count(*)::text from domain_events
            where event_type like 'execution.%'
              and payload::text like '%E2E execution%'
          ) as content_leaks,
          (
            select count(*)::text from domain_events
            where event_type like 'integration.%'
               or event_type like 'delivery.%'
          ) as provider_events,
          (
            select count(*)::text from execution_records
            where evidence_type = 'calendar_elapsed_unknown'
              and confidence_class = 'unknown'
              and outcome = 'unknown'
          ) as unknown_confidence
      `;
      expect(audit).toEqual({
        content_leaks: '0',
        provider_events: '0',
        unknown_confidence: '1',
      });
    } finally {
      await sql.end();
      await request.dispose();
    }
  });

  test('ingests and reviews local sources with exact citations and no provider activity', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: baseUrl,
      userAgent: 'meridian-knowledge-fixture',
    });
    const sourceText =
      '# Synthetic finding\n\nA bounded synthetic fixture reports a local result.\n\n## Limitation\n\nNo personal data.';
    const sourceFile = {
      buffer: Buffer.from(sourceText),
      mimeType: 'text/markdown',
      name: 'synthetic-source.md',
    };
    const metadata = {
      authors: ['Synthetic Fixture'],
      canonicalUrl: null,
      copyrightAndUseNotes: 'Synthetic test content.',
      doi: null,
      evidenceDomain: ['testing'],
      language: 'en',
      ownerConfirmed: true,
      ownerConfirmedRights: true,
      ownerNotes: null,
      processingClass: 'private',
      publicationDate: null,
      publisherOrVenue: null,
      sourceClass: 'personal_notes',
      title: 'E2E synthetic knowledge source',
    };
    try {
      expect((await request.get('/api/knowledge/sources')).status()).toBe(401);
      expect((await login(request)).status()).toBe(200);
      const csrfToken = await csrfCookie(request);
      const page = await request.get('/knowledge');
      expect(page.status()).toBe(200);
      expect(await page.text()).toContain('Knowledge Library');

      const missingCsrf = await request.post('/api/knowledge/sources', {
        multipart: { file: sourceFile, metadata: JSON.stringify(metadata) },
      });
      expect(missingCsrf.status()).toBe(403);

      const uploaded = await request.post('/api/knowledge/sources', {
        headers: { 'x-csrf-token': csrfToken },
        multipart: { file: sourceFile, metadata: JSON.stringify(metadata) },
      });
      expect(uploaded.status()).toBe(201);
      const detail = (await uploaded.json()) as {
        claims: unknown[];
        revisions: {
          chunkCount: number;
          id: string;
          originalContentHash: string;
          parsedText: string;
        }[];
        source: { id: string; reviewStatus: string; version: number };
      };
      expect(detail).toMatchObject({
        claims: [],
        revisions: [
          {
            chunkCount: 1,
            parsedText: sourceText,
          },
        ],
        source: { reviewStatus: 'unreviewed', version: 1 },
      });
      expect(detail.revisions[0]?.originalContentHash).toHaveLength(64);

      const claimText = 'A bounded synthetic fixture reports a local result.';
      const sourceSpanStart = sourceText.indexOf(claimText);
      const claim = await request.post(
        `/api/knowledge/sources/${detail.source.id}/claims`,
        {
          data: {
            claimText,
            claimType: 'finding',
            direction: null,
            effectExpression: null,
            interventionOrExposure: null,
            outcome: null,
            ownerConfirmed: true,
            populationScope: null,
            sourceRevisionId: detail.revisions[0]?.id,
            sourceSpanEnd: sourceSpanStart + claimText.length,
            sourceSpanStart,
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(claim.status()).toBe(201);
      const claimBody = (await claim.json()) as {
        citations: unknown[];
        id: string;
        reviewStatus: string;
        version: number;
      };
      expect(claimBody).toMatchObject({
        citations: [{}],
        reviewStatus: 'candidate',
        version: 1,
      });

      const reviewedClaim = await request.post(
        `/api/knowledge/claims/${claimBody.id}/review`,
        {
          data: {
            decision: 'reviewed',
            expectedVersion: claimBody.version,
            ownerConfirmed: true,
            reviewerNotes: null,
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(reviewedClaim.status()).toBe(200);
      expect(await reviewedClaim.json()).toMatchObject({
        reviewStatus: 'reviewed',
      });

      const reviewedSource = await request.post(
        `/api/knowledge/sources/${detail.source.id}/review`,
        {
          data: {
            expectedVersion: detail.source.version,
            ownerConfirmed: true,
            reviewStatus: 'reviewed',
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(reviewedSource.status()).toBe(200);
      expect(await reviewedSource.json()).toMatchObject({
        reviewStatus: 'reviewed',
      });

      const original = await request.get(
        `/api/knowledge/revisions/${detail.revisions[0]?.id ?? ''}/original`,
      );
      expect(original.status()).toBe(200);
      expect(await original.text()).toBe(sourceText);

      const duplicate = await request.post('/api/knowledge/sources', {
        headers: { 'x-csrf-token': csrfToken },
        multipart: { file: sourceFile, metadata: JSON.stringify(metadata) },
      });
      expect(duplicate.status()).toBe(409);

      const deletionRequest = await request.post(
        `/api/knowledge/sources/${detail.source.id}/deletion-request`,
        {
          data: {
            confirmation: 'REQUEST DELETE KNOWLEDGE SOURCE',
            expectedVersion: 2,
            ownerConfirmed: true,
          },
          headers: { 'x-csrf-token': csrfToken },
        },
      );
      expect(deletionRequest.status()).toBe(202);
      expect(await deletionRequest.json()).toMatchObject({
        deletionRequestedAt: expect.any(String),
        version: 3,
      });

      const sql = postgres(databaseUrl, { prepare: false });
      try {
        const [audit] = await sql<
          { content_leaks: string; provider_events: string }[]
        >`
          select
            count(*) filter (
              where event_type like 'knowledge.%'
                and payload::text like '%bounded synthetic%'
            )::text as content_leaks,
            count(*) filter (
              where event_type like 'integration.%'
                 or event_type like 'delivery.%'
            )::text as provider_events
          from domain_events
        `;
        expect(audit).toEqual({ content_leaks: '0', provider_events: '0' });
      } finally {
        await sql.end();
      }
    } finally {
      await request.dispose();
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
