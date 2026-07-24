'use client';

import {
  knowledgeClaimResponseV1Schema,
  knowledgeSourceDetailResponseV1Schema,
  knowledgeSourceListResponseV1Schema,
} from '@meridian/api-contracts';
import type {
  KnowledgeSourceDetailResponseV1,
  KnowledgeSourceResponseV1,
} from '@meridian/api-contracts';
import { useEffect, useRef, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

type SourceClass =
  | 'book_or_chapter'
  | 'clinical_or_professional_guideline'
  | 'controlled_non_randomised_study'
  | 'expert_commentary'
  | 'mechanistic_or_laboratory_study'
  | 'narrative_review'
  | 'observational_study'
  | 'personal_notes'
  | 'podcast_or_transcript'
  | 'randomised_trial'
  | 'systematic_review_or_meta_analysis'
  | 'unknown';

async function failureMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? 'The knowledge command failed safely.';
}

export function KnowledgeApp() {
  const [sources, setSources] = useState<KnowledgeSourceResponseV1[]>([]);
  const [detail, setDetail] = useState<KnowledgeSourceDetailResponseV1 | null>(
    null,
  );
  const [message, setMessage] = useState('Loading local sources…');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceClass, setSourceClass] = useState<SourceClass>('unknown');
  const [processingClass, setProcessingClass] = useState<
    'private' | 'sensitive' | 'standard'
  >('private');
  const [copyrightNotes, setCopyrightNotes] = useState(
    'Owner-supplied copy retained for personal reference.',
  );
  const [claimType, setClaimType] = useState<
    | 'contraindication'
    | 'finding'
    | 'limitation'
    | 'measurement'
    | 'mechanism'
    | 'population'
    | 'dose_or_schedule'
    | 'recommendation'
    | 'uncertainty'
  >('finding');
  const [file, setFile] = useState<File | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function refreshSources() {
    const response = await fetch('/api/knowledge/sources', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(await failureMessage(response));
    setSources(
      knowledgeSourceListResponseV1Schema.parse(await response.json()).sources,
    );
    setMessage('');
  }

  async function openSource(sourceId: string) {
    const response = await fetch(`/api/knowledge/sources/${sourceId}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(await failureMessage(response));
    setDetail(
      knowledgeSourceDetailResponseV1Schema.parse(await response.json()),
    );
  }

  useEffect(() => {
    void refreshSources().catch((error: unknown) => {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The Knowledge Library is unavailable.',
      );
    });
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The knowledge command failed safely.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function postJson(path: string, body: unknown) {
    const csrf = readCsrfCookie();
    if (!csrf) throw new Error('Your security token is unavailable.');
    const response = await fetch(path, {
      body: JSON.stringify(body),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      method: 'POST',
    });
    if (!response.ok) throw new Error(await failureMessage(response));
    return response;
  }

  async function postForm(path: string, metadata: unknown, selected: File) {
    const csrf = readCsrfCookie();
    if (!csrf) throw new Error('Your security token is unavailable.');
    const form = new FormData();
    form.set('file', selected);
    form.set('metadata', JSON.stringify(metadata));
    const response = await fetch(path, {
      body: form,
      credentials: 'same-origin',
      headers: { 'x-csrf-token': csrf },
      method: 'POST',
    });
    if (!response.ok) throw new Error(await failureMessage(response));
    return response;
  }

  async function upload() {
    if (!file) throw new Error('Choose a source file first.');
    const response = await postForm(
      '/api/knowledge/sources',
      {
        authors: [],
        canonicalUrl: null,
        copyrightAndUseNotes: copyrightNotes,
        doi: null,
        evidenceDomain: [],
        language: 'en',
        ownerConfirmed: true,
        ownerConfirmedRights: true,
        ownerNotes: null,
        processingClass,
        publicationDate: null,
        publisherOrVenue: null,
        sourceClass,
        title,
      },
      file,
    );
    const created = knowledgeSourceDetailResponseV1Schema.parse(
      await response.json(),
    );
    setDetail(created);
    setTitle('');
    setFile(null);
    setMessage('Source preserved and parsed locally.');
    await refreshSources();
  }

  async function reviewSource(
    status: 'reference_only' | 'rejected' | 'reviewed',
  ) {
    if (!detail) return;
    const response = await postJson(
      `/api/knowledge/sources/${detail.source.id}/review`,
      {
        expectedVersion: detail.source.version,
        ownerConfirmed: true,
        reviewStatus: status,
      },
    );
    const source = (await response.json()) as KnowledgeSourceResponseV1;
    setMessage(`Source marked ${source.reviewStatus.replaceAll('_', ' ')}.`);
    await openSource(source.id);
    await refreshSources();
  }

  async function requestDeletion() {
    if (!detail) return;
    const response = await postJson(
      `/api/knowledge/sources/${detail.source.id}/deletion-request`,
      {
        confirmation: 'REQUEST DELETE KNOWLEDGE SOURCE',
        expectedVersion: detail.source.version,
        ownerConfirmed: true,
      },
    );
    const source = (await response.json()) as KnowledgeSourceResponseV1;
    setMessage(
      'Deletion requested. The source is frozen; verified erasure remains a governed WP-22 operation.',
    );
    await openSource(source.id);
    await refreshSources();
  }

  async function revise() {
    if (!detail || !revisionFile)
      throw new Error('Choose a corrected source file first.');
    const response = await postForm(
      `/api/knowledge/sources/${detail.source.id}/revisions`,
      {
        expectedSourceVersion: detail.source.version,
        ownerConfirmed: true,
        ownerConfirmedRights: true,
        processingClass,
      },
      revisionFile,
    );
    setDetail(
      knowledgeSourceDetailResponseV1Schema.parse(await response.json()),
    );
    setRevisionFile(null);
    setMessage(
      'Immutable corrected revision added; prior claims require review again.',
    );
    await refreshSources();
  }

  async function createClaim() {
    if (!detail) return;
    const revision = detail.revisions.at(-1);
    const textarea = textRef.current;
    if (!revision || !textarea)
      throw new Error('No parsed source text is available.');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (end <= start)
      throw new Error('Select an exact source span before creating a claim.');
    const claimText = revision.parsedText.slice(start, end);
    const response = await postJson(
      `/api/knowledge/sources/${detail.source.id}/claims`,
      {
        claimText,
        claimType,
        direction: null,
        effectExpression: null,
        interventionOrExposure: null,
        outcome: null,
        ownerConfirmed: true,
        populationScope: null,
        sourceRevisionId: revision.id,
        sourceSpanEnd: end,
        sourceSpanStart: start,
      },
    );
    knowledgeClaimResponseV1Schema.parse(await response.json());
    setMessage('Exact-span candidate claim added for owner review.');
    await openSource(detail.source.id);
  }

  async function reviewClaim(
    claimId: string,
    version: number,
    decision: 'rejected' | 'reviewed',
  ) {
    await postJson(`/api/knowledge/claims/${claimId}/review`, {
      decision,
      expectedVersion: version,
      ownerConfirmed: true,
      reviewerNotes: null,
    });
    setMessage(`Candidate claim ${decision}.`);
    if (detail) await openSource(detail.source.id);
  }

  const latest = detail?.revisions.at(-1);

  return (
    <div className="goals-grid">
      <section className="panel">
        <p className="eyebrow">Local ingestion only</p>
        <h2>Add an external source</h2>
        <p>
          Plain text, Markdown, and text-layer PDF up to 10 MiB. Scanned PDFs
          are retained as OCR required. No source is sent to a model or external
          service.
        </p>
        <label>
          Source title
          <input
            maxLength={500}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
            }}
            required
            value={title}
          />
        </label>
        <label>
          Source class
          <select
            onChange={(event) => {
              setSourceClass(event.currentTarget.value as SourceClass);
            }}
            value={sourceClass}
          >
            <option value="unknown">Unknown</option>
            <option value="systematic_review_or_meta_analysis">
              Systematic review or meta-analysis
            </option>
            <option value="randomised_trial">Randomised trial</option>
            <option value="controlled_non_randomised_study">
              Controlled non-randomised study
            </option>
            <option value="observational_study">Observational study</option>
            <option value="mechanistic_or_laboratory_study">
              Mechanistic or laboratory study
            </option>
            <option value="clinical_or_professional_guideline">
              Clinical or professional guideline
            </option>
            <option value="narrative_review">Narrative review</option>
            <option value="expert_commentary">Expert commentary</option>
            <option value="book_or_chapter">Book or chapter</option>
            <option value="podcast_or_transcript">Podcast or transcript</option>
            <option value="personal_notes">Personal notes</option>
          </select>
        </label>
        <label>
          Processing class
          <select
            onChange={(event) => {
              setProcessingClass(
                event.currentTarget.value as
                  'private' | 'sensitive' | 'standard',
              );
            }}
            value={processingClass}
          >
            <option value="private">Private — local display only</option>
            <option value="sensitive">Sensitive — no route enabled</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <label>
          Copyright and use note
          <textarea
            maxLength={2000}
            onChange={(event) => {
              setCopyrightNotes(event.currentTarget.value);
            }}
            required
            value={copyrightNotes}
          />
        </label>
        <label>
          Source file
          <input
            accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
            }}
            type="file"
          />
        </label>
        <button
          disabled={busy || !file || title.trim().length === 0}
          onClick={() => void run(upload)}
          type="button"
        >
          Preserve and parse locally
        </button>
        <p role="status">{message}</p>
      </section>

      <section className="panel">
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p>No external sources retained.</p>
        ) : (
          <ul className="stack-list">
            {sources.map((source) => (
              <li key={source.id}>
                <button
                  disabled={busy}
                  onClick={() => void run(() => openSource(source.id))}
                  type="button"
                >
                  {source.title}
                </button>
                <p>
                  {source.sourceClass.replaceAll('_', ' ')} ·{' '}
                  {source.reviewStatus.replaceAll('_', ' ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <>
          <section className="panel">
            <p className="eyebrow">External source, not personal evidence</p>
            <h2>{detail.source.title}</h2>
            <p>
              Review: {detail.source.reviewStatus.replaceAll('_', ' ')} ·
              Correction: {detail.source.correctionStatus.replaceAll('_', ' ')}
            </p>
            {detail.source.deletionRequestedAt ? (
              <p role="status">
                Deletion requested. Interpretation and revision are frozen
                pending verified owner-controlled erasure.
              </p>
            ) : null}
            <div className="button-row">
              <button
                disabled={busy || detail.source.deletionRequestedAt !== null}
                onClick={() => void run(() => reviewSource('reviewed'))}
                type="button"
              >
                Mark source reviewed
              </button>
              <button
                disabled={busy || detail.source.deletionRequestedAt !== null}
                onClick={() => void run(() => reviewSource('reference_only'))}
                type="button"
              >
                Reference only
              </button>
              <button
                disabled={busy || detail.source.deletionRequestedAt !== null}
                onClick={() => void run(() => reviewSource('rejected'))}
                type="button"
              >
                Reject interpretation
              </button>
            </div>
            {latest ? (
              <p>
                Revision {latest.revisionNumber} · {latest.extractionQuality} ·{' '}
                {latest.chunkCount} local chunks · parser {latest.parserVersion}
              </p>
            ) : null}
            <label>
              Corrected source revision
              <input
                accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
                onChange={(event) => {
                  setRevisionFile(event.currentTarget.files?.[0] ?? null);
                }}
                type="file"
              />
            </label>
            <button
              disabled={
                busy ||
                !revisionFile ||
                detail.source.deletionRequestedAt !== null
              }
              onClick={() => void run(revise)}
              type="button"
            >
              Add immutable corrected revision
            </button>
            <button
              disabled={busy || detail.source.deletionRequestedAt !== null}
              onClick={() => void run(requestDeletion)}
              type="button"
            >
              Request governed deletion
            </button>
          </section>

          <section className="panel">
            <h2>Parsed source and exact-span claim</h2>
            {latest?.parsedText ? (
              <>
                <p>
                  Select an exact passage below. WP-18 allows extractive
                  candidate claims only; no model paraphrase or citation is
                  invented.
                </p>
                <textarea
                  aria-label="Parsed source text"
                  readOnly
                  ref={textRef}
                  rows={16}
                  value={latest.parsedText}
                />
                <label>
                  Claim type
                  <select
                    onChange={(event) => {
                      setClaimType(
                        event.currentTarget.value as typeof claimType,
                      );
                    }}
                    value={claimType}
                  >
                    <option value="finding">Finding</option>
                    <option value="mechanism">Mechanism</option>
                    <option value="recommendation">Recommendation</option>
                    <option value="limitation">Limitation</option>
                    <option value="contraindication">Contraindication</option>
                    <option value="measurement">Measurement</option>
                    <option value="population">Population</option>
                    <option value="dose_or_schedule">Dose or schedule</option>
                    <option value="uncertainty">Uncertainty</option>
                  </select>
                </label>
                <button
                  disabled={busy}
                  onClick={() => void run(createClaim)}
                  type="button"
                >
                  Add selected passage as candidate claim
                </button>
              </>
            ) : (
              <p>
                No parsed text is available. The original remains preserved for
                owner review.
              </p>
            )}
          </section>

          <section className="panel">
            <h2>Claim review</h2>
            {detail.claims.length === 0 ? (
              <p>No candidate claims.</p>
            ) : (
              <ul className="stack-list">
                {detail.claims.map((item) => (
                  <li key={item.id}>
                    <blockquote>{item.claimText}</blockquote>
                    <p>
                      {item.claimType} · {item.reviewStatus} ·{' '}
                      {item.citations.length} exact citation
                      {item.citations.length === 1 ? '' : 's'}
                    </p>
                    {item.reviewStatus === 'candidate' ? (
                      <div className="button-row">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              reviewClaim(item.id, item.version, 'reviewed'),
                            )
                          }
                          type="button"
                        >
                          Review claim
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              reviewClaim(item.id, item.version, 'rejected'),
                            )
                          }
                          type="button"
                        >
                          Reject claim
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p>
              Reviewed claims remain statements reported by this source. They do
              not become facts about you, health advice, or active protocols.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
