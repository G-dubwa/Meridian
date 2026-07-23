'use client';

import {
  schedulingProposalResponseV1Schema,
  schedulingSnapshotResponseV1Schema,
} from '@meridian/api-contracts';
import type { SchedulingSnapshotResponseV1 } from '@meridian/api-contracts';
import { useEffect, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function instant(localValue: string): string {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime()))
    throw new Error('Enter a valid local time.');
  return date.toISOString();
}

export function PlanningApp() {
  const [snapshot, setSnapshot] = useState<SchedulingSnapshotResponseV1 | null>(
    null,
  );
  const [message, setMessage] = useState('Loading local planning…');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  async function refresh() {
    const response = await fetch('/api/planning', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Local planning could not be loaded.');
    setSnapshot(
      schedulingSnapshotResponseV1Schema.parse(await response.json()),
    );
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open local planning.');
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
        failure?.error?.message ?? 'The local planning command failed.',
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
        error instanceof Error ? error.message : 'Local planning failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function propose(form: HTMLFormElement) {
    const data = new FormData(form);
    const earliestStart = instant(text(data, 'earliestStart'));
    const deadline = instant(text(data, 'deadline'));
    const timeZone = text(data, 'timeZone');
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone !== browserTimeZone)
      throw new Error(
        `This local-time form requires the browser time zone (${browserTimeZone}).`,
      );
    const target = text(data, 'target');
    const [targetType, targetId] = target.split(':');
    const response = await post('/api/planning', {
      bufferMinutes: Number(text(data, 'bufferMinutes')),
      deadline,
      earliestStart,
      estimatedEffortMinutes: Number(text(data, 'estimatedEffortMinutes')),
      goalId: targetType === 'goal' ? targetId : null,
      maxBlockMinutes: Number(text(data, 'maxBlockMinutes')),
      maxDeepWorkMinutesPerDay: Number(text(data, 'maxDeepWorkMinutesPerDay')),
      minBlockMinutes: Number(text(data, 'minBlockMinutes')),
      ownerConfirmed: true,
      taskId: targetType === 'task' ? targetId : null,
      timeZone,
      title: text(data, 'title'),
      workingWindows: [{ endsAt: deadline, startsAt: earliestStart }],
    });
    schedulingProposalResponseV1Schema.parse(await response.json());
    form.reset();
    setMessage('Deterministic preview created. Review every block.');
    await refresh();
  }

  async function decide(
    proposal: SchedulingSnapshotResponseV1['proposals'][number],
    decision: 'accept' | 'dismiss',
  ) {
    if (decision === 'accept' && !confirmed[proposal.id])
      throw new Error('Confirm the exact preview before accepting it.');
    const response = await post(`/api/planning/${proposal.id}/${decision}`, {
      expectedVersion: proposal.version,
      ownerConfirmed: true,
    });
    const result = schedulingProposalResponseV1Schema.parse(
      await response.json(),
    );
    setMessage(
      result.state === 'stale'
        ? 'The local plan changed. This preview is stale; create a new one.'
        : decision === 'accept'
          ? 'Exact blocks accepted into Meridian’s local plan.'
          : 'Proposal dismissed without creating blocks.',
    );
    await refresh();
  }

  if (!snapshot)
    return (
      <section className="panel">
        <p role="status">{message}</p>
      </section>
    );

  const targets = [
    ...snapshot.tasks.map((task) => ({
      id: `task:${task.id}`,
      label: `Task · ${task.title}`,
    })),
    ...snapshot.goals.map((goal) => ({
      id: `goal:${goal.id}`,
      label: `Goal · ${goal.title}`,
    })),
  ];

  return (
    <div className="goals-grid">
      <section className="panel">
        <p className="eyebrow">External calendar unavailable</p>
        <h2>Local-only planning boundary</h2>
        <p>
          Provider status: <strong>{snapshot.providerStatus}</strong>. Busy time
          comes only from Meridian agenda and accepted local planning blocks.
          Acceptance never sends a calendar request or notification.
        </p>
      </section>

      <section className="panel">
        <h2>Create a deterministic preview</h2>
        {targets.length === 0 ? (
          <p>Add an open task or non-terminal goal first.</p>
        ) : (
          <form
            className="goal-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => propose(event.currentTarget));
            }}
          >
            <label>
              Plan for
              <select name="target" required>
                <option value="">Select a local task or goal</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Block label
              <input maxLength={240} name="title" required />
            </label>
            <label>
              Available from
              <input name="earliestStart" required type="datetime-local" />
            </label>
            <label>
              Deadline / available until
              <input name="deadline" required type="datetime-local" />
            </label>
            <label>
              Time zone
              <input
                defaultValue="Africa/Johannesburg"
                name="timeZone"
                required
              />
            </label>
            <label>
              Effort minutes
              <input
                defaultValue="120"
                min="15"
                name="estimatedEffortMinutes"
                required
                type="number"
              />
            </label>
            <label>
              Minimum block minutes
              <input
                defaultValue="30"
                min="15"
                name="minBlockMinutes"
                required
                type="number"
              />
            </label>
            <label>
              Maximum block minutes
              <input
                defaultValue="90"
                min="15"
                name="maxBlockMinutes"
                required
                type="number"
              />
            </label>
            <label>
              Buffer around busy time
              <input
                defaultValue="15"
                min="0"
                name="bufferMinutes"
                required
                type="number"
              />
            </label>
            <label>
              Daily deep-work maximum
              <input
                defaultValue="240"
                min="15"
                name="maxDeepWorkMinutesPerDay"
                required
                type="number"
              />
            </label>
            <button disabled={busy} type="submit">
              Calculate exact preview
            </button>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Proposals</h2>
        <p role="status">{message}</p>
        {snapshot.proposals.length === 0 ? <p>No proposals yet.</p> : null}
        {snapshot.proposals.map((proposal) => (
          <article className="goal-card" key={proposal.id}>
            <h3>{proposal.title}</h3>
            <p>
              <strong>{proposal.verdict}</strong> · {proposal.scheduledMinutes}/
              {proposal.estimatedEffortMinutes} minutes scheduled ·{' '}
              {proposal.capacityMinutes} minutes capacity
            </p>
            <ol>
              {proposal.candidates.map((candidate) => (
                <li key={candidate.ordinal}>
                  {new Date(candidate.startsAt).toLocaleString()} →{' '}
                  {new Date(candidate.endsAt).toLocaleString()} (
                  {candidate.minutes} min)
                </li>
              ))}
            </ol>
            {proposal.exclusions.map((item) => (
              <p key={item}>{item}</p>
            ))}
            {proposal.alternatives.map((item) => (
              <p key={item}>Alternative: {item}</p>
            ))}
            {proposal.state === 'pending' ? (
              <>
                <label className="confirmation-row">
                  <input
                    checked={confirmed[proposal.id] ?? false}
                    onChange={(event) => {
                      setConfirmed((current) => ({
                        ...current,
                        [proposal.id]: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  I confirm these exact local blocks. They are plan intent, not
                  execution evidence or an external calendar booking.
                </label>
                <div className="button-row">
                  <button
                    disabled={
                      busy ||
                      proposal.verdict === 'infeasible' ||
                      !confirmed[proposal.id]
                    }
                    onClick={() => void run(() => decide(proposal, 'accept'))}
                    type="button"
                  >
                    Accept exact blocks
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => decide(proposal, 'dismiss'))}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            ) : (
              <p>State: {proposal.state}</p>
            )}
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Accepted local blocks</h2>
        {snapshot.blocks.length === 0 ? <p>No accepted blocks.</p> : null}
        {snapshot.blocks.map((block) => (
          <article className="goal-card" key={block.id}>
            <h3>{block.title}</h3>
            <p>
              {new Date(block.currentStartsAt).toLocaleString()} →{' '}
              {new Date(block.currentEndsAt).toLocaleString()} ·{' '}
              {block.plannedEffortMinutes} planned minutes
            </p>
            <p>
              Local plan only. Completion must be confirmed separately and is
              not inferred from this block.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
