'use client';

import {
  retrievalPreviewResponseV1Schema,
  retrievalStatusResponseV1Schema,
} from '@meridian/api-contracts';
import type {
  RetrievalPreviewResponseV1,
  RetrievalStatusResponseV1,
} from '@meridian/api-contracts';
import { useEffect, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

export function RecallApp() {
  const [status, setStatus] = useState<RetrievalStatusResponseV1 | null>(null);
  const [preview, setPreview] = useState<RetrievalPreviewResponseV1 | null>(
    null,
  );
  const [message, setMessage] = useState('Loading retrieval policy…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/retrieval', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Retrieval policy could not load.');
        setStatus(retrievalStatusResponseV1Schema.parse(await response.json()));
        setMessage('');
      })
      .catch(() => {
        setMessage('Sign in to use local recall.');
      });
  }, []);

  async function search(form: HTMLFormElement) {
    const query = new FormData(form).get('query');
    const csrfToken = readCsrfCookie();
    if (typeof query !== 'string' || !csrfToken) {
      setMessage('The query or security token is unavailable.');
      return;
    }
    setBusy(true);
    setMessage('Searching locally…');
    try {
      const response = await fetch('/api/retrieval', {
        body: JSON.stringify({
          lanes: ['personal', 'external'],
          limitPerLane: 5,
          purpose: 'recall_preview',
          query,
        }),
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        method: 'POST',
      });
      if (!response.ok)
        throw new Error('Local recall failed closed. No context was used.');
      const result = retrievalPreviewResponseV1Schema.parse(
        await response.json(),
      );
      setPreview(result);
      setMessage(
        result.results.length === 0
          ? 'No eligible Standard evidence matched.'
          : `Found ${String(result.results.length)} eligible local references.`,
      );
    } catch (error) {
      setPreview(null);
      setMessage(
        error instanceof Error ? error.message : 'Local recall failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="recall-grid">
      <section className="panel">
        <p className="eyebrow">Privacy boundary</p>
        <h2>Local evidence search</h2>
        <p>
          Only current Standard journal revisions and eligible Standard
          Knowledge chunks can enter this context preview. Personal and external
          evidence remain separate lanes.
        </p>
        <p className="guidance-note">
          Semantic embeddings:{' '}
          <strong>{status?.semanticRetrieval ?? 'inactive'}</strong>. No query
          or source text is sent to a provider.
        </p>
        <form
          className="goal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void search(event.currentTarget);
          }}
        >
          <label>
            Recall query
            <input
              name="query"
              minLength={2}
              maxLength={500}
              required
              placeholder="What did I record about the synthetic launch?"
            />
          </label>
          <button type="submit" disabled={busy || !status}>
            Search eligible local evidence
          </button>
        </form>
        <p role="status">{message}</p>
      </section>

      {(['personal_evidence', 'external_evidence'] as const).map((lane) => (
        <section className="panel" key={lane}>
          <p className="eyebrow">
            {lane === 'personal_evidence'
              ? 'Personal evidence'
              : 'External evidence'}
          </p>
          <h2>
            {lane === 'personal_evidence'
              ? 'Journal references'
              : 'Knowledge references'}
          </h2>
          {(preview?.results ?? [])
            .filter((result) => result.evidenceLane === lane)
            .map((result) => (
              <article className="recall-result" key={result.contentHash}>
                <header>
                  <h3>{result.title}</h3>
                  <span className="state-badge">
                    {result.methods.join(' + ')}
                  </span>
                </header>
                <p>{result.excerpt}</p>
                <p className="resource-label">
                  Score {result.score.toFixed(3)} · revision{' '}
                  {result.entryRevisionId ?? result.knowledgeSourceRevisionId}
                </p>
                <a href={result.href}>Open source evidence</a>
              </article>
            ))}
          {preview?.results.every((result) => result.evidenceLane !== lane) ? (
            <p>No eligible matches in this lane.</p>
          ) : null}
        </section>
      ))}

      {preview ? (
        <section className="panel manifest-panel">
          <p className="eyebrow">Inspectable context</p>
          <h2>What informed this preview?</h2>
          <p>
            Manifest {preview.manifest.id} records references and policy—not the
            search text or copied evidence bodies.
          </p>
          <ol>
            {preview.manifest.items.map((item) => (
              <li key={item.ordinal}>
                <strong>{item.evidenceLane.replaceAll('_', ' ')}</strong>{' '}
                {item.policyReference ??
                  item.entryRevisionId ??
                  item.knowledgeChunkId}
                {item.href ? (
                  <>
                    {' '}
                    · <a href={item.href}>source</a>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
