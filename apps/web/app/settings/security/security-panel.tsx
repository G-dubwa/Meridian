'use client';

import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { postWithCsrf } from '../../_components/auth-client';

interface SessionSummary {
  readonly identifier: string;
  readonly activeSessionCount: number;
  readonly idleExpiresAt: string;
}

function formField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function SecurityPanel() {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [message, setMessage] = useState('Loading security status…');

  async function refresh() {
    const response = await fetch('/api/auth/session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      setSession(null);
      setMessage('Your session is not active. Sign in again.');
      return;
    }
    const body = (await response.json()) as SessionSummary;
    setSession(body);
    setMessage('');
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function changePassword(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await postWithCsrf('/api/auth/password', {
      currentPassphrase: formField(data, 'currentPassphrase'),
      newPassphrase: formField(data, 'newPassphrase'),
    });
    setMessage(
      response.ok
        ? 'Passphrase changed. Other sessions were revoked.'
        : 'Passphrase change was rejected.',
    );
    if (response.ok) form.reset();
    await refresh();
  }

  async function revoke(includeCurrent: boolean) {
    const response = await postWithCsrf('/api/auth/sessions/revoke', {
      includeCurrent,
    });
    if (includeCurrent && response.ok) {
      window.location.assign('/login');
      return;
    }
    setMessage(
      response.ok ? 'Other sessions revoked.' : 'Revocation was rejected.',
    );
    await refresh();
  }

  async function renew() {
    const response = await postWithCsrf('/api/auth/session/renew', {});
    setMessage(response.ok ? 'Session renewed.' : 'Renewal was rejected.');
    await refresh();
  }

  if (!session)
    return (
      <section className="auth-card">
        <p className="form-message">{message}</p>
        <a href="/login">Return to sign in</a>
      </section>
    );

  return (
    <div className="security-grid">
      <section className="auth-card">
        <h2>Active session</h2>
        <dl>
          <div>
            <dt>Owner</dt>
            <dd>{session.identifier}</dd>
          </div>
          <div>
            <dt>Active sessions</dt>
            <dd>{session.activeSessionCount}</dd>
          </div>
          <div>
            <dt>Idle expiry</dt>
            <dd>{new Date(session.idleExpiresAt).toLocaleString()}</dd>
          </div>
        </dl>
        <button onClick={() => void renew()} type="button">
          Renew this session
        </button>
        <button
          className="button-secondary"
          onClick={() => void revoke(false)}
          type="button"
        >
          Revoke other sessions
        </button>
        <button
          className="button-danger"
          onClick={() => void revoke(true)}
          type="button"
        >
          Sign out everywhere
        </button>
      </section>

      <form
        className="auth-card"
        onSubmit={(event) => {
          void changePassword(event);
        }}
      >
        <h2>Change passphrase</h2>
        <label>
          Current passphrase
          <input
            autoComplete="current-password"
            minLength={16}
            name="currentPassphrase"
            required
            type="password"
          />
        </label>
        <label>
          New passphrase
          <input
            autoComplete="new-password"
            minLength={16}
            name="newPassphrase"
            required
            type="password"
          />
        </label>
        <button type="submit">Change passphrase</button>
      </form>
      {message ? (
        <p className="form-message status-message">{message}</p>
      ) : null}
    </div>
  );
}
