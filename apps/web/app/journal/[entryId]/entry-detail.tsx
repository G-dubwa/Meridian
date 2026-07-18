'use client';

import { createJournalApiClientV1 } from '@meridian/api-contracts';
import type { JournalEntryResponseV1 } from '@meridian/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { readCsrfCookie } from '../../_components/auth-client';

function isProcessingClass(
  value: FormDataEntryValue | null,
): value is 'standard' | 'sensitive' | 'private' {
  return (
    typeof value === 'string' &&
    ['standard', 'sensitive', 'private'].includes(value)
  );
}

export function EntryDetail({ entryId }: { readonly entryId: string }) {
  const [view, setView] = useState<JournalEntryResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading entry…');

  async function refresh() {
    try {
      setView(await createJournalApiClientV1().getEntry(entryId));
      setMessage('');
    } catch {
      setMessage('This entry is unavailable.');
    }
  }

  useEffect(() => {
    void refresh();
  }, [entryId]);

  async function revise(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!view) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const bodyMarkdown = data.get('bodyMarkdown');
    const processingClass = data.get('processingClass');
    const csrfToken = readCsrfCookie();
    if (
      typeof bodyMarkdown !== 'string' ||
      !isProcessingClass(processingClass) ||
      !csrfToken
    )
      return;
    try {
      setView(
        await createJournalApiClientV1().reviseEntry(
          entryId,
          {
            bodyMarkdown,
            expectedVersion: view.entry.version,
            processingClass,
          },
          csrfToken,
        ),
      );
      setMessage('New revision saved; earlier revisions were preserved.');
    } catch {
      setMessage('The revision was rejected. Reload before trying again.');
    }
  }

  async function transition(operation: 'archive' | 'delete') {
    if (!view) return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) return;
    if (
      operation === 'delete' &&
      !window.confirm(
        'Request permanent deletion of this entry and every revision? This package records the request; governed deletion executes later.',
      )
    )
      return;
    try {
      setView(
        operation === 'archive'
          ? await createJournalApiClientV1().archiveEntry(
              entryId,
              view.entry.version,
              csrfToken,
            )
          : await createJournalApiClientV1().requestHardDeletion(
              entryId,
              view.entry.version,
              csrfToken,
            ),
      );
      setMessage(
        operation === 'archive'
          ? 'Entry archived.'
          : 'Hard-deletion request recorded.',
      );
    } catch {
      setMessage('The journal state changed elsewhere. Reload and try again.');
    }
  }

  if (!view)
    return (
      <section className="auth-card">
        <p>{message}</p>
        <Link href="/journal">Back to journal</Link>
      </section>
    );

  return (
    <div className="entry-detail-grid">
      <section className="auth-card">
        <div className="entry-meta">
          <span className={`privacy-badge ${view.entry.processingClass}`}>
            {view.entry.processingClass}
          </span>
          <span>{view.entry.status.replace('_', ' ')}</span>
          <span>Version {view.entry.version}</span>
        </div>
        <p className="entry-body">{view.entry.bodyMarkdown}</p>
        {view.entry.status === 'active' ? (
          <div className="button-row">
            <button type="button" onClick={() => void transition('archive')}>
              Archive
            </button>
            <button
              className="button-danger"
              type="button"
              onClick={() => void transition('delete')}
            >
              Request hard deletion
            </button>
          </div>
        ) : view.entry.status === 'archived' ? (
          <button
            className="button-danger"
            type="button"
            onClick={() => void transition('delete')}
          >
            Request hard deletion
          </button>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </section>

      {view.entry.status === 'active' ? (
        <form
          key={view.revisions.at(-1)?.id}
          className="auth-card"
          onSubmit={(event) => void revise(event)}
        >
          <h2>Edit as a new revision</h2>
          <label>
            Journal text
            <textarea
              defaultValue={view.entry.bodyMarkdown}
              maxLength={100_000}
              name="bodyMarkdown"
              required
              rows={8}
            />
          </label>
          <label>
            Processing class
            <select
              defaultValue={view.entry.processingClass}
              name="processingClass"
            >
              <option value="standard">Standard</option>
              <option value="sensitive">Sensitive</option>
              <option value="private">Private</option>
            </select>
          </label>
          <button type="submit">Save new revision</button>
        </form>
      ) : null}

      <section className="revision-history">
        <h2>Revision history</h2>
        {[...view.revisions].reverse().map((revision) => (
          <article className="timeline-entry" key={revision.id}>
            <div className="entry-meta">
              <strong>Revision {revision.revisionNumber}</strong>
              <span>{revision.changeKind}</span>
              <span className={`privacy-badge ${revision.processingClass}`}>
                {revision.processingClass}
              </span>
              <time dateTime={revision.createdAt}>
                {new Date(revision.createdAt).toLocaleString()}
              </time>
            </div>
            <p>{revision.bodyMarkdown}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
