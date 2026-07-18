'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { issueCsrfToken, postWithCsrf } from '../_components/auth-client';

type Mode = 'password' | 'recovery';

function formField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const csrf = await issueCsrfToken();
      const response = await postWithCsrf(
        mode === 'password' ? '/api/auth/login' : '/api/auth/recovery',
        mode === 'password'
          ? {
              identifier: formField(data, 'identifier'),
              passphrase: formField(data, 'passphrase'),
            }
          : {
              identifier: formField(data, 'identifier'),
              recoveryCode: formField(data, 'recoveryCode'),
            },
        csrf,
      );
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? 'Too many attempts. Please wait before trying again.'
            : 'Those credentials were not accepted.',
        );
        return;
      }
      router.replace('/settings/security');
      router.refresh();
    } catch {
      setMessage('Meridian could not complete sign-in. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="auth-card"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Owner identifier
        <input
          autoComplete="username"
          defaultValue="owner"
          name="identifier"
          required
        />
      </label>
      {mode === 'password' ? (
        <label>
          Passphrase
          <input
            autoComplete="current-password"
            minLength={16}
            name="passphrase"
            required
            type="password"
          />
        </label>
      ) : (
        <label>
          One-time recovery code
          <input
            autoCapitalize="characters"
            autoComplete="off"
            name="recoveryCode"
            placeholder="MRD-XXXXXXXX-XXXXXXXX"
            required
          />
        </label>
      )}
      {message ? <p className="form-message">{message}</p> : null}
      <button disabled={busy} type="submit">
        {busy ? 'Checking…' : mode === 'password' ? 'Sign in' : 'Use code'}
      </button>
      <button
        className="button-secondary"
        onClick={() => {
          setMessage('');
          setMode(mode === 'password' ? 'recovery' : 'password');
        }}
        type="button"
      >
        {mode === 'password' ? 'Use a recovery code' : 'Use my passphrase'}
      </button>
    </form>
  );
}
