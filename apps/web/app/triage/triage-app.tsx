'use client';

import {
  proposalListResponseV1Schema,
  proposalResponseV1Schema,
} from '@meridian/api-contracts';
import type { ProposalListResponseV1 } from '@meridian/api-contracts';
import { useEffect, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

const empty: ProposalListResponseV1 = { proposals: [] };

export function TriageApp() {
  const [state, setState] = useState(empty);
  const [message, setMessage] = useState('Loading proposals…');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/triage/proposals', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Triage could not be loaded.');
    setState(proposalListResponseV1Schema.parse(await response.json()));
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open Triage.');
    });
  }, []);

  async function decide(
    proposal: ProposalListResponseV1['proposals'][number],
    decision: 'accept' | 'edit_accept' | 'dismiss',
    editedTitle?: string,
  ) {
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setMessage('Your security token is unavailable. Refresh and try again.');
      return;
    }
    setBusyId(proposal.id);
    try {
      const body = {
        decision,
        expectedVersion: proposal.version,
        ownerConfirmed: true as const,
        ...(decision === 'edit_accept'
          ? {
              editedPayload: {
                ...proposal.payload,
                title: editedTitle,
              },
            }
          : {}),
      };
      const response = await fetch(
        `/api/triage/proposals/${proposal.id}/decision`,
        {
          body: JSON.stringify(body),
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          method: 'POST',
        },
      );
      if (!response.ok) throw new Error('Decision was rejected.');
      proposalResponseV1Schema.parse(await response.json());
      setMessage(
        decision === 'dismiss'
          ? 'Proposal dismissed.'
          : 'Owner decision recorded. Downstream mutation remains inactive.',
      );
      await refresh();
    } catch {
      setMessage('The proposal decision could not be recorded.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="triage-list" aria-live="polite">
      {message ? <p className="form-message">{message}</p> : null}
      {state.proposals.length === 0 && !message ? (
        <article className="auth-card triage-card">
          <h2>Triage is clear</h2>
          <p>
            Ambiguous input is not placed here automatically; it asks for
            clarification.
          </p>
        </article>
      ) : null}
      {state.proposals.map((proposal) => (
        <article className="auth-card triage-card" key={proposal.id}>
          <div className="entry-meta">
            <span className="privacy-badge standard">
              {proposal.proposalType}
            </span>
            <span>{proposal.assertionClass.replaceAll('_', ' ')}</span>
          </div>
          <h2>{proposal.payload.title}</h2>
          {proposal.payload.detail ? <p>{proposal.payload.detail}</p> : null}
          <dl>
            <div>
              <dt>Source revision</dt>
              <dd>{proposal.sourceRevisionId}</dd>
            </div>
            <div>
              <dt>Source span</dt>
              <dd>
                {proposal.sourceSpanStart}–{proposal.sourceSpanEnd}
              </dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{new Date(proposal.expiresAt).toLocaleString()}</dd>
            </div>
          </dl>
          <form
            className="triage-edit"
            onSubmit={(event) => {
              event.preventDefault();
              const title = new FormData(event.currentTarget).get('title');
              if (typeof title === 'string' && title.trim()) {
                void decide(proposal, 'edit_accept', title.trim());
              }
            }}
          >
            <label>
              Edit title before recording acceptance
              <input
                defaultValue={proposal.payload.title}
                name="title"
                required
              />
            </label>
            <div className="button-row">
              <button disabled={busyId === proposal.id} type="submit">
                Edit and accept
              </button>
              <button
                disabled={busyId === proposal.id}
                onClick={() => void decide(proposal, 'accept')}
                type="button"
              >
                Accept as proposed
              </button>
              <button
                className="button-danger"
                disabled={busyId === proposal.id}
                onClick={() => void decide(proposal, 'dismiss')}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </form>
        </article>
      ))}
    </section>
  );
}
