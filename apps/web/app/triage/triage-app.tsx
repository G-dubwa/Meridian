'use client';

import {
  proposalListResponseV1Schema,
  proposalDecisionResponseV1Schema,
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
    acceptedReminder?: {
      expiresAt: null;
      priority: 'normal';
      recurrence: null;
      timeZone: string;
      triggerAt: string;
    },
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
        ...(acceptedReminder === undefined ? {} : { acceptedReminder }),
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
      const result = proposalDecisionResponseV1Schema.parse(
        await response.json(),
      );
      setMessage(
        decision === 'dismiss'
          ? 'Proposal dismissed.'
          : `Created ${result.action?.receipt.targetType ?? 'target'} with receipt ${result.action?.receipt.id ?? 'unavailable'}.`,
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
                const triggerAt = event.currentTarget.dataset.reminderInstant;
                const acceptedReminder =
                  proposal.proposalType === 'reminder' && triggerAt
                    ? {
                        expiresAt: null,
                        priority: 'normal' as const,
                        recurrence: null,
                        timeZone:
                          Intl.DateTimeFormat().resolvedOptions().timeZone,
                        triggerAt,
                      }
                    : undefined;
                if (
                  proposal.proposalType === 'reminder' &&
                  acceptedReminder === undefined
                ) {
                  setMessage('Choose and confirm a reminder instant.');
                  return;
                }
                void decide(
                  proposal,
                  'edit_accept',
                  title.trim(),
                  acceptedReminder,
                );
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
              {proposal.proposalType !== 'reminder' ? (
                <button
                  disabled={busyId === proposal.id}
                  onClick={() => void decide(proposal, 'accept')}
                  type="button"
                >
                  Accept as proposed
                </button>
              ) : null}
              <button
                className="button-danger"
                disabled={busyId === proposal.id}
                onClick={() => void decide(proposal, 'dismiss')}
                type="button"
              >
                Dismiss
              </button>
            </div>
            {proposal.proposalType === 'reminder' ? (
              <label>
                Confirm reminder instant
                <input
                  name="reminder-time"
                  type="datetime-local"
                  required
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (!value) return;
                    event.currentTarget.form?.setAttribute(
                      'data-reminder-instant',
                      new Date(value).toISOString(),
                    );
                  }}
                />
                <button
                  disabled={busyId === proposal.id}
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    const triggerAt = form?.dataset.reminderInstant;
                    if (!triggerAt) {
                      setMessage('Choose and confirm a reminder instant.');
                      return;
                    }
                    void decide(proposal, 'accept', undefined, {
                      expiresAt: null,
                      priority: 'normal',
                      recurrence: null,
                      timeZone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                      triggerAt,
                    });
                  }}
                  type="button"
                >
                  Accept reminder
                </button>
              </label>
            ) : null}
          </form>
        </article>
      ))}
    </section>
  );
}
