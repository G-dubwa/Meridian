'use client';

import {
  executionRecordResponseV1Schema,
  reconcileElapsedResponseV1Schema,
  weeklyReviewResponseV1Schema,
} from '@meridian/api-contracts';
import type { WeeklyReviewResponseV1 } from '@meridian/api-contracts';
import { useEffect, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

function currentMonday(): string {
  const date = new Date();
  const day = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - day + 1);
  return localDate(date);
}

const observationLabels: Readonly<
  Record<WeeklyReviewResponseV1['observations'][number]['code'], string>
> = {
  confirmed_matches_plan:
    'Confirmed execution covers most planned time in this review window.',
  insufficient_evidence:
    'There is not yet enough confirmed evidence for a stronger observation.',
  postponements_repeated:
    'Two or more task due dates moved later during this review window.',
  unknown_exceeds_confirmed:
    'Unknown elapsed time exceeds confirmed execution in this review window.',
};

export function WeeklyApp() {
  const [review, setReview] = useState<WeeklyReviewResponseV1 | null>(null);
  const [weekStartsOn, setWeekStartsOn] = useState(currentMonday);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [message, setMessage] = useState('Loading local evidence…');
  const [busy, setBusy] = useState(false);

  async function refresh(start = weekStartsOn) {
    const query = new URLSearchParams({ timeZone, weekStartsOn: start });
    const response = await fetch(`/api/execution/weekly?${query}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('The Weekly could not be loaded.');
    setReview(weeklyReviewResponseV1Schema.parse(await response.json()));
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open The Weekly.');
    });
  }, []);

  async function post(path: string, body: unknown) {
    const csrfToken = readCsrfCookie();
    if (!csrfToken) throw new Error('Your security token is unavailable.');
    const response = await fetch(path, {
      body: JSON.stringify(body),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      method: 'POST',
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        failure?.error?.message ?? 'The evidence command failed safely.',
      );
    }
    return response;
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The Weekly failed safely.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function respond(
    item: WeeklyReviewResponseV1['inbox'][number],
    response: 'done' | 'partly_done' | 'not_done' | 'rescheduled' | 'skip',
    reportedDurationMinutes: number | null,
  ) {
    const result = await post(
      `/api/execution/blocks/${item.block.id}/respond`,
      {
        expectedBlockVersion: item.block.version,
        ownerConfirmed: true,
        reportedDurationMinutes,
        response,
      },
    );
    executionRecordResponseV1Schema.parse(await result.json());
    setMessage('Owner-confirmed execution evidence recorded locally.');
    await refresh();
  }

  async function reconcile() {
    const result = await post('/api/execution/reconcile', {
      through: new Date().toISOString(),
    });
    const count = reconcileElapsedResponseV1Schema.parse(
      await result.json(),
    ).recorded;
    setMessage(
      `${String(count)} elapsed block${count === 1 ? '' : 's'} recorded as unknown with zero progress credit.`,
    );
    await refresh();
  }

  if (!review)
    return (
      <section className="panel">
        <p role="status">{message}</p>
      </section>
    );

  return (
    <div className="goals-grid">
      <section className="panel">
        <p className="eyebrow">Local evidence boundary</p>
        <h2>No provider or model activity</h2>
        <p>
          Calendar time is a plan, never proof of work. Microsoft, other
          calendars, external task systems, notifications, and model-generated
          interpretations are inactive.
        </p>
        <label>
          Week beginning
          <input
            type="date"
            value={weekStartsOn}
            onChange={(event) => {
              setWeekStartsOn(event.currentTarget.value);
            }}
          />
        </label>
        <div className="button-row">
          <button
            disabled={busy}
            onClick={() => {
              void run(() => refresh(weekStartsOn));
            }}
            type="button"
          >
            Load week
          </button>
          <button
            disabled={busy}
            onClick={() => void run(reconcile)}
            type="button"
          >
            Record elapsed as unknown
          </button>
        </div>
        <p role="status">{message}</p>
      </section>

      <section className="panel">
        <h2>Planned versus confirmed</h2>
        <dl>
          <dt>Planned</dt>
          <dd>{review.plannedMinutes} minutes</dd>
          <dt>Confirmed completed</dt>
          <dd>{review.confirmedCompletedMinutes} minutes</dd>
          <dt>Confirmed partial</dt>
          <dd>{review.confirmedPartialMinutes} minutes</dd>
          <dt>Explicitly not completed</dt>
          <dd>{review.explicitlyNotCompletedMinutes} minutes</dd>
          <dt>Unknown elapsed</dt>
          <dd>{review.unknownElapsedMinutes} minutes — no progress credit</dd>
          <dt>Rescheduled</dt>
          <dd>{review.rescheduledMinutes} minutes</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Other confirmed signals</h2>
        <dl>
          <dt>Tasks completed</dt>
          <dd>{review.completedTaskCount}</dd>
          <dt>Task due dates moved later</dt>
          <dd>{review.postponedTaskEditCount}</dd>
          <dt>Reminders completed</dt>
          <dd>{review.reminderCompletedCount}</dd>
          <dt>Reminders dismissed</dt>
          <dd>{review.reminderDismissedCount}</dd>
          <dt>Open Triage proposals</dt>
          <dd>{review.openTriageCount}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Execution confirmation inbox</h2>
        {review.inbox.length === 0 ? (
          <p>No elapsed local planning blocks in this week.</p>
        ) : (
          <ul className="stack-list">
            {review.inbox.map((item) => (
              <li key={item.block.id}>
                <strong>{item.block.title}</strong>
                <p>
                  Planned {item.block.plannedEffortMinutes} minutes ·{' '}
                  {item.status === 'recorded'
                    ? `Recorded: ${item.record?.outcome ?? 'unknown'}`
                    : 'Awaiting owner confirmation'}
                </p>
                {item.status === 'awaiting_confirmation' ? (
                  <div className="button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() => respond(item, 'done', null))
                      }
                      type="button"
                    >
                      Done as planned
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        const raw = window.prompt(
                          'Confirmed minutes (less than planned):',
                        );
                        if (raw === null) return;
                        const minutes = Number(raw);
                        void run(() => respond(item, 'partly_done', minutes));
                      }}
                      type="button"
                    >
                      Partly done
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() => respond(item, 'not_done', null))
                      }
                      type="button"
                    >
                      Not done
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() => respond(item, 'rescheduled', null))
                      }
                      type="button"
                    >
                      Rescheduled
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() => respond(item, 'skip', null))
                      }
                      type="button"
                    >
                      Skip this check
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Evidence-linked observations</h2>
        {review.observations.length === 0 ? (
          <p>No descriptive observation is warranted.</p>
        ) : (
          <ul>
            {review.observations.map((observation) => (
              <li key={observation.code}>
                {observationLabels[observation.code]} Evidence references:{' '}
                {observation.evidenceRecordIds.length}.
              </li>
            ))}
          </ul>
        )}
        <p>
          These are deterministic descriptions, not productivity scores, success
          probabilities, or model advice.
        </p>
      </section>
    </div>
  );
}
