'use client';

import { createJournalApiClientV1 } from '@meridian/api-contracts';
import type {
  JournalActivityResponseV1,
  JournalEntryListResponseV1,
} from '@meridian/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

const emptyEntries: JournalEntryListResponseV1 = { entries: [] };
const emptyActivity: JournalActivityResponseV1 = { activity: [] };

function eventLabel(eventType: string): string {
  return eventType
    .replace('journal.entry_', '')
    .replace('.v1', '')
    .replaceAll('_', ' ');
}

function isProcessingClass(
  value: FormDataEntryValue | null,
): value is 'standard' | 'sensitive' | 'private' {
  return (
    typeof value === 'string' &&
    ['standard', 'sensitive', 'private'].includes(value)
  );
}

export function JournalApp() {
  const [entries, setEntries] = useState(emptyEntries);
  const [activity, setActivity] = useState(emptyActivity);
  const [message, setMessage] = useState('Loading journal…');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const client = createJournalApiClientV1();
    try {
      const [nextEntries, nextActivity] = await Promise.all([
        client.listEntries(),
        client.listActivity(),
      ]);
      setEntries(nextEntries);
      setActivity(nextActivity);
      setMessage('');
    } catch {
      setMessage('Sign in to open your journal.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const bodyMarkdown = data.get('bodyMarkdown');
    const processingClass = data.get('processingClass');
    const csrfToken = readCsrfCookie();
    if (
      typeof bodyMarkdown !== 'string' ||
      !isProcessingClass(processingClass) ||
      !csrfToken
    ) {
      setMessage('The entry could not be saved.');
      return;
    }
    setBusy(true);
    try {
      await createJournalApiClientV1().createEntry(
        {
          bodyMarkdown,
          processingClass,
        },
        csrfToken,
      );
      form.reset();
      setMessage('Entry saved.');
      await refresh();
    } catch {
      setMessage('The entry could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="journal-layout">
      <section>
        <form
          className="auth-card journal-composer"
          onSubmit={(event) => void submit(event)}
        >
          <h2>Write an entry</h2>
          <label>
            Journal text
            <textarea
              maxLength={100_000}
              name="bodyMarkdown"
              placeholder="What is on your mind?"
              required
              rows={8}
            />
          </label>
          <fieldset className="privacy-selector">
            <legend>Processing class — choose before saving</legend>
            <label>
              <input
                defaultChecked
                name="processingClass"
                type="radio"
                value="standard"
              />
              <span>
                <strong>Standard</strong>
                <small>Eligible for configured future processing.</small>
              </span>
            </label>
            <label>
              <input name="processingClass" type="radio" value="sensitive" />
              <span>
                <strong>Sensitive</strong>
                <small>Local unless a specific route is enabled later.</small>
              </span>
            </label>
            <label>
              <input name="processingClass" type="radio" value="private" />
              <span>
                <strong>Private</strong>
                <small>Local display only; never returned for AI work.</small>
              </span>
            </label>
          </fieldset>
          <button disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save entry'}
          </button>
          {message ? <p className="form-message">{message}</p> : null}
        </form>

        <section className="timeline" aria-label="Journal timeline">
          <h2>Timeline</h2>
          {entries.entries.length === 0 ? (
            <p>No entries yet.</p>
          ) : (
            entries.entries.map((entry) => (
              <article className="timeline-entry" key={entry.id}>
                <div className="entry-meta">
                  <span className={`privacy-badge ${entry.processingClass}`}>
                    {entry.processingClass}
                  </span>
                  <span>{entry.status.replace('_', ' ')}</span>
                  <time dateTime={entry.occurredAt}>
                    {new Date(entry.occurredAt).toLocaleString()}
                  </time>
                </div>
                <p>{entry.bodyMarkdown}</p>
                <Link href={`/journal/${entry.id}`}>
                  Open entry and history
                </Link>
              </article>
            ))
          )}
        </section>
      </section>

      <aside className="auth-card activity-ledger">
        <h2>Journal activity</h2>
        <p>Content-free actions recorded for this owner.</p>
        <ol>
          {activity.activity.map((item) => (
            <li key={item.eventId}>
              <Link href={`/journal/${item.entryId}`}>
                {eventLabel(item.eventType)}
              </Link>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
