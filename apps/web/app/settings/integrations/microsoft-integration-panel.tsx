'use client';

import type {
  MicrosoftConnectionStatusResponseV1,
  MicrosoftTodoStatusResponseV1,
} from '@meridian/api-contracts';
import { getMicrosoftConnectionStatusV1 } from '@meridian/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { postWithCsrf } from '../../_components/auth-client';

const scopePurpose = [
  ['openid', 'Identify the Microsoft account during the connection flow.'],
  ['profile', 'Read basic profile claims for the connected-account label.'],
  ['offline_access', 'Refresh access without repeatedly prompting the owner.'],
  [
    'User.Read',
    'Authorize read-only profile access; callback authentication uses the signed ID token.',
  ],
  ['Calendars.Read', 'Read the owner’s calendar in the later WP-12 sync.'],
] as const;

const todoScopePurpose = [
  ['openid', 'Identify the Microsoft account during authorization.'],
  ['profile', 'Return the basic account label after authorization.'],
  ['offline_access', 'Permit encrypted refresh-token replacement.'],
  [
    'User.Read',
    'Permit one ID-only profile read if legacy account continuity cannot be proven directly.',
  ],
  ['Calendars.Read', 'Preserve the already approved calendar-read grant.'],
  ['Tasks.ReadWrite', 'Run only the contained WP-11 synthetic To Do test.'],
] as const;

export function MicrosoftIntegrationPanel() {
  const [status, setStatus] =
    useState<MicrosoftConnectionStatusResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading Microsoft status…');
  const [todoStatus, setTodoStatus] =
    useState<MicrosoftTodoStatusResponseV1 | null>(null);
  const [testTime, setTestTime] = useState('');
  const [testIdempotencyKey, setTestIdempotencyKey] = useState<string | null>(
    null,
  );

  async function refresh() {
    try {
      const current = await getMicrosoftConnectionStatusV1();
      setStatus(current);
      if (current.configured) {
        const todoResponse = await fetch('/api/integrations/microsoft/todo', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (todoResponse.ok)
          setTodoStatus(
            (await todoResponse.json()) as MicrosoftTodoStatusResponseV1,
          );
      }
      const outcome = new URLSearchParams(window.location.search).get(
        'microsoft',
      );
      setMessage(
        outcome === 'connected'
          ? 'Microsoft connected with the approved scope envelope.'
          : outcome === 'owner-review-required'
            ? 'Microsoft identity continuity requires owner review. No token was retained.'
            : outcome === 'account-mismatch'
              ? 'The authorized Microsoft account did not match the retained historical account. No token was retained.'
              : outcome === 'failed'
                ? 'Microsoft connection failed safely. No token was retained.'
                : '',
      );
    } catch {
      setStatus(null);
      setMessage('Microsoft status is unavailable. Sign in again if needed.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function connect() {
    setMessage('Preparing a one-time Microsoft authorization request…');
    try {
      const response = await postWithCsrf('/api/integrations/microsoft', {});
      if (!response.ok) {
        setMessage(
          response.status === 503
            ? 'Microsoft local configuration is incomplete.'
            : 'Microsoft connection could not be started.',
        );
        return;
      }
      const body = (await response.json()) as { authorizationUrl?: unknown };
      if (typeof body.authorizationUrl !== 'string')
        throw new Error('Authorization URL missing.');
      window.location.assign(body.authorizationUrl);
    } catch {
      setMessage('Microsoft connection could not be started.');
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        'Disconnect Microsoft and permanently remove locally stored tokens?',
      )
    )
      return;
    const response = await postWithCsrf(
      '/api/integrations/microsoft/disconnect',
      { confirmation: 'DISCONNECT' },
    );
    setMessage(
      response.ok
        ? 'Microsoft disconnected. Local provider tokens were removed.'
        : 'Microsoft disconnect was rejected.',
    );
    await refresh();
  }

  async function beginTodoConsent() {
    const exactRequested = status?.todoConsent.requestedScopes.join(' ');
    if (!exactRequested) return;
    if (
      !window.confirm(
        `Begin the separately approved authorization with exactly these requested scopes?\n\n${exactRequested}\n\nThis will leave Meridian for Microsoft’s consent screen.`,
      )
    )
      return;
    const response = await postWithCsrf(
      '/api/integrations/microsoft/todo/consent',
      { confirmation: 'ENABLE WP11 TODO CONSENT' },
    );
    if (!response.ok) {
      setMessage('Incremental To Do consent could not be started.');
      return;
    }
    const body = (await response.json()) as { authorizationUrl?: unknown };
    if (typeof body.authorizationUrl !== 'string') {
      setMessage('Incremental To Do consent response was invalid.');
      return;
    }
    window.location.assign(body.authorizationUrl);
  }

  async function firstDayTest() {
    if (!testTime) {
      setMessage('Choose the approved Johannesburg first-day test time.');
      return;
    }
    if (
      !window.confirm(
        `Create the one synthetic Meridian test reminder for ${testTime} Africa/Johannesburg?`,
      )
    )
      return;
    const idempotencyKey = testIdempotencyKey ?? crypto.randomUUID();
    setTestIdempotencyKey(idempotencyKey);
    const response = await postWithCsrf(
      '/api/integrations/microsoft/todo/first-day',
      {
        confirmation: 'CREATE WP11 FIRST-DAY TEST',
        idempotencyKey,
        reminderAt: `${testTime}:00+02:00`,
      },
    );
    setMessage(
      response.ok
        ? 'Synthetic test is prepared. Record Graph, app, notification, and completion observations separately.'
        : 'First-day test failed closed. Retry uses the same local idempotency key.',
    );
    await refresh();
  }

  async function todoControl(
    route: 'reconcile' | 'cleanup' | 'suspend',
    confirmation: string,
  ) {
    const labels = {
      cleanup: 'delete the marker-owned synthetic task and Meridian list',
      reconcile: 'read back only the marker-owned synthetic task status',
      suspend:
        'remove local Microsoft tokens and immediately suspend all Graph access',
    } as const;
    if (!window.confirm(`Confirm: ${labels[route]}?`)) return;
    const response = await postWithCsrf(
      `/api/integrations/microsoft/todo/${route}`,
      { confirmation },
    );
    setMessage(
      response.ok
        ? `WP-11 ${route} control completed.`
        : `WP-11 ${route} control failed closed.`,
    );
    await refresh();
  }

  if (!status)
    return (
      <section className="auth-card">
        <p className="form-message" role="status">
          {message}
        </p>
        <Link href="/login">Return to sign in</Link>
      </section>
    );

  const connected = status.account?.status === 'connected';
  const todoConsented =
    connected && status.account?.requestedScopes.includes('Tasks.ReadWrite');
  const todoConsentEligible = status.todoConsent.eligible;
  return (
    <div className="security-grid">
      <section className="auth-card">
        <h2>Microsoft account</h2>
        <p>
          Status:{' '}
          <strong>
            {status.account?.status.replaceAll('_', ' ') ?? 'not connected'}
          </strong>
        </p>
        {status.account ? (
          <p>Retained historical account label: {status.account.displayName}</p>
        ) : null}
        {!status.configured ? (
          <p>
            Local OAuth configuration is incomplete. Meridian remains usable
            with Microsoft disconnected.
          </p>
        ) : null}
        {connected ? (
          <button
            className="button-danger"
            onClick={() => void disconnect()}
            type="button"
          >
            Disconnect Microsoft
          </button>
        ) : todoConsentEligible ? (
          <p>
            The retained historical five-scope account is eligible for the
            guarded authorization below. Eligibility permits the attempt but
            does not prove that the newly authorized Microsoft account matches.
            No separate five-scope reconnect is required.
          </p>
        ) : (
          <button
            disabled={!status.configured}
            onClick={() => void connect()}
            type="button"
          >
            Connect Microsoft read-only
          </button>
        )}
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        <p>
          <Link href="/settings/security">Security settings</Link>
        </p>
      </section>

      <section className="auth-card">
        <h2>Experimental Microsoft To Do gate</h2>
        <p>
          The channel is inactive. These owner-confirmed controls are limited to
          one synthetic occurrence and the marker-owned private Meridian list.
        </p>
        <p>
          Local list: <strong>{todoStatus?.listStatus ?? 'not created'}</strong>
          <br />
          Test task: <strong>{todoStatus?.taskStatus ?? 'not created'}</strong>
          {todoStatus?.reminderAt ? (
            <>
              <br />
              Scheduled: {new Date(todoStatus.reminderAt).toLocaleString()}
            </>
          ) : null}
        </p>
        {todoConsentEligible ? (
          <>
            <p>The next authorization request is exactly:</p>
            <dl>
              {todoScopePurpose.map(([scope, purpose]) => (
                <div key={scope}>
                  <dt>{scope}</dt>
                  <dd>{purpose}</dd>
                </div>
              ))}
            </dl>
            <p>
              Expected Graph token permissions:{' '}
              {status.todoConsent.expectedGraphPermissions.join(', ')}
            </p>
            <p>
              After signed ID-token validation, Meridian compares the new
              identity with the retained account. If their identifiers use
              different legacy representations, it performs one read-only
              Microsoft Graph <code>/me?$select=id</code> check. No To Do list
              or task is accessed during consent.
            </p>
          </>
        ) : null}
        {todoConsentEligible && !todoConsented ? (
          <button onClick={() => void beginTodoConsent()} type="button">
            Begin guarded exact six-scope consent
          </button>
        ) : null}
        {todoConsented && todoStatus?.taskStatus === null ? (
          <>
            <label htmlFor="todo-test-time">
              Approved Johannesburg test time
            </label>
            <input
              id="todo-test-time"
              onChange={(event) => {
                setTestTime(event.target.value);
              }}
              type="datetime-local"
              value={testTime}
            />
            <button onClick={() => void firstDayTest()} type="button">
              Create one first-day test
            </button>
          </>
        ) : null}
        {todoConsented && todoStatus?.taskStatus === 'pending' ? (
          <button
            onClick={() =>
              void todoControl('reconcile', 'OBSERVE WP11 COMPLETION')
            }
            type="button"
          >
            Observe test completion
          </button>
        ) : null}
        {todoConsented && todoStatus?.listStatus === 'experimental' ? (
          <button
            onClick={() =>
              void todoControl('cleanup', 'DELETE WP11 SYNTHETIC OBJECTS')
            }
            type="button"
          >
            Clean up synthetic task and list
          </button>
        ) : null}
        {connected ? (
          <button
            className="button-danger"
            onClick={() => void todoControl('suspend', 'SUSPEND WP11 GRAPH')}
            type="button"
          >
            Emergency suspend all Microsoft Graph access
          </button>
        ) : null}
      </section>

      <section className="auth-card">
        <h2>Provider-processing register</h2>
        <p>
          Meridian sends the authorization code, PKCE verifier, client
          credential, and refresh token only to Microsoft’s{' '}
          <code>consumers</code> token endpoint. Tokens are encrypted before
          PostgreSQL storage. A guarded legacy continuity bridge may send only
          the candidate opaque access token to Microsoft Graph for one
          ID-selected <code>/me</code> read before storage. Journal entries are
          not sent.
        </p>
        <dl>
          {scopePurpose.map(([scope, purpose]) => (
            <div key={scope}>
              <dt>{scope}</dt>
              <dd>{purpose}</dd>
            </div>
          ))}
        </dl>
        <p>
          The normal connect action excludes Tasks.ReadWrite. The separate
          guarded WP-11 control may add only delegated Tasks.ReadWrite; calendar
          write, mail, shared-calendar-specific, and application permissions
          remain excluded.
        </p>
      </section>

      <section className="auth-card">
        <h2>Consent ledger</h2>
        {status.consentRecords.length === 0 ? (
          <p>No Microsoft consent has been recorded.</p>
        ) : (
          <ol className="plain-list">
            {status.consentRecords.map((record, index) => (
              <li key={`${record.occurredAt}-${String(index)}`}>
                <strong>{record.action.replaceAll('_', ' ')}</strong>{' '}
                {new Date(record.occurredAt).toLocaleString()}
                <br />
                Requested: {record.requestedScopes.join(', ')}
                <br />
                Graph token: {record.graphPermissions.join(', ')}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
