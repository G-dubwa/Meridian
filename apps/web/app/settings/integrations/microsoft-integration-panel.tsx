'use client';

import type { MicrosoftConnectionStatusResponseV1 } from '@meridian/api-contracts';
import { getMicrosoftConnectionStatusV1 } from '@meridian/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { postWithCsrf } from '../../_components/auth-client';

const scopePurpose = [
  ['openid', 'Identify the Microsoft account during the connection flow.'],
  ['profile', 'Read basic profile claims for the connected-account label.'],
  ['offline_access', 'Refresh access without repeatedly prompting the owner.'],
  ['User.Read', 'Read the signed-in owner’s basic Microsoft profile.'],
  ['Calendars.Read', 'Read the owner’s calendar in the later WP-12 sync.'],
] as const;

export function MicrosoftIntegrationPanel() {
  const [status, setStatus] =
    useState<MicrosoftConnectionStatusResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading Microsoft status…');

  async function refresh() {
    try {
      const current = await getMicrosoftConnectionStatusV1();
      setStatus(current);
      const outcome = new URLSearchParams(window.location.search).get(
        'microsoft',
      );
      setMessage(
        outcome === 'connected'
          ? 'Microsoft connected with the approved read-only scope set.'
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
        {status.account ? <p>Account: {status.account.displayName}</p> : null}
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
        <h2>Provider-processing register</h2>
        <p>
          Meridian sends the authorization code, PKCE verifier, client
          credential, and refresh token only to Microsoft’s{' '}
          <code>consumers</code> token endpoint. Tokens are encrypted before
          PostgreSQL storage. Journal entries are not sent.
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
          Explicitly excluded: calendar write, To Do, mail, shared-calendar, and
          application permissions.
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
                {record.scopes.join(', ')}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
