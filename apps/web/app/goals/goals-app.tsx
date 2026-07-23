'use client';

import {
  edgeResponseV1Schema,
  goalResponseV1Schema,
  goalSnapshotResponseV1Schema,
} from '@meridian/api-contracts';
import type { GoalSnapshotResponseV1 } from '@meridian/api-contracts';
import { useEffect, useMemo, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

type Goal = GoalSnapshotResponseV1['goals'][number];

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function nextStates(goal: Goal): readonly Goal['state'][] {
  switch (goal.state) {
    case 'incubating':
      return ['active', 'retired'];
    case 'active':
      return ['paused', 'completed', 'retired', 'merged'];
    case 'paused':
      return ['active', 'retired'];
    default:
      return [];
  }
}

export function GoalsApp() {
  const [snapshot, setSnapshot] = useState<GoalSnapshotResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading goals…');
  const [busy, setBusy] = useState(false);
  const [acknowledgeLimit, setAcknowledgeLimit] = useState(false);

  async function refresh() {
    const response = await fetch('/api/goals', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Goals could not be loaded.');
    setSnapshot(goalSnapshotResponseV1Schema.parse(await response.json()));
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open goals.');
    });
  }, []);

  async function post(path: string, body: unknown): Promise<Response> {
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
        failure?.error?.message ?? 'The owner-confirmed goal change failed.',
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
        error instanceof Error ? error.message : 'The goal change failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createGoal(form: HTMLFormElement) {
    const data = new FormData(form);
    const targetDate = text(data, 'targetDate');
    const response = await post('/api/goals', {
      lifeDomain: text(data, 'lifeDomain'),
      narrative: text(data, 'narrative'),
      ownerConfirmed: true,
      successCriteria: text(data, 'successCriteria'),
      targetDate: targetDate || null,
      title: text(data, 'title'),
      type: text(data, 'type'),
    });
    goalResponseV1Schema.parse(await response.json());
    form.reset();
    setMessage('Goal saved locally in the incubating state.');
    await refresh();
  }

  async function editGoal(form: HTMLFormElement, goal: Goal) {
    const data = new FormData(form);
    const targetDate = text(data, 'targetDate');
    const response = await post(`/api/goals/${goal.id}/edit`, {
      expectedVersion: goal.version,
      lifeDomain: text(data, 'lifeDomain'),
      narrative: text(data, 'narrative'),
      ownerConfirmed: true,
      successCriteria: text(data, 'successCriteria'),
      targetDate: targetDate || null,
      title: text(data, 'title'),
      type: text(data, 'type'),
    });
    goalResponseV1Schema.parse(await response.json());
    setMessage('Goal updated locally.');
    await refresh();
  }

  async function transition(goal: Goal, nextState: Goal['state']) {
    let mergedIntoGoalId: string | null = null;
    if (nextState === 'merged') {
      mergedIntoGoalId =
        window.prompt('Paste the destination goal ID shown on its card.') ??
        null;
      if (!mergedIntoGoalId) return;
    }
    const response = await post(`/api/goals/${goal.id}/transition`, {
      acknowledgeActiveLimit: acknowledgeLimit,
      expectedVersion: goal.version,
      mergedIntoGoalId,
      nextState,
      ownerConfirmed: true,
    });
    goalResponseV1Schema.parse(await response.json());
    setMessage(`Goal moved to ${nextState}.`);
    setAcknowledgeLimit(false);
    await refresh();
  }

  async function updateLimit(form: HTMLFormElement) {
    const data = new FormData(form);
    await post('/api/goals/load-limit', {
      ownerConfirmed: true,
      softActiveGoalLimit: Number(text(data, 'softActiveGoalLimit')),
    });
    setMessage('Soft active-goal guidance updated.');
    await refresh();
  }

  async function createEdge(form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await post('/api/goals/edges', {
      edgeType: text(data, 'edgeType'),
      ownerConfirmed: true,
      sourceResourceId: text(data, 'sourceResourceId'),
      targetResourceId: text(data, 'targetResourceId'),
    });
    edgeResponseV1Schema.parse(await response.json());
    setMessage('Relationship saved locally.');
    await refresh();
  }

  const goalNames = useMemo(
    () =>
      new Map(
        (snapshot?.goals ?? []).map((goal) => [goal.resourceId, goal.title]),
      ),
    [snapshot],
  );
  const blockers = useMemo(
    () =>
      new Map(
        (snapshot?.blockers ?? []).map((item) => [
          item.goalResourceId,
          item.blockingResourceIds,
        ]),
      ),
    [snapshot],
  );

  if (!snapshot)
    return (
      <section className="panel">
        <p role="status">{message}</p>
      </section>
    );

  return (
    <div className="goals-grid">
      <section className="panel load-panel" aria-labelledby="load-heading">
        <div>
          <p className="eyebrow">Transparent guidance</p>
          <h2 id="load-heading">Active load</h2>
          <p className={`load-status load-${snapshot.guidance.status}`}>
            {snapshot.guidance.activeCount} active of a soft{' '}
            {snapshot.guidance.limit}-goal guide
          </p>
          <p>
            {snapshot.guidance.status === 'within_limit'
              ? 'Within the owner-selected guide.'
              : snapshot.guidance.status === 'at_limit'
                ? 'At the guide. Another activation needs acknowledgement.'
                : `${String(snapshot.guidance.overBy)} above the guide; this is advice, not a storage limit.`}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => updateLimit(event.currentTarget));
          }}
        >
          <label>
            Soft active-goal guide
            <input
              defaultValue={snapshot.guidance.limit}
              max="20"
              min="1"
              name="softActiveGoalLimit"
              required
              type="number"
            />
          </label>
          <button disabled={busy} type="submit">
            Save guide
          </button>
        </form>
        {snapshot.guidance.requiresAcknowledgement ? (
          <label className="confirmation-row">
            <input
              checked={acknowledgeLimit}
              onChange={(event) => {
                setAcknowledgeLimit(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            I acknowledge the soft-load explanation before another activation.
          </label>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="create-goal-heading">
        <h2 id="create-goal-heading">Add an incubating goal</h2>
        <form
          className="goal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => createGoal(event.currentTarget));
          }}
        >
          <label>
            Title
            <input maxLength={240} name="title" required />
          </label>
          <div className="field-pair">
            <label>
              Type
              <select defaultValue="outcome" name="type">
                <option value="outcome">Outcome</option>
                <option value="behavioural">Behavioural</option>
              </select>
            </label>
            <label>
              Life domain
              <input maxLength={100} name="lifeDomain" required />
            </label>
          </div>
          <label>
            Narrative in your words
            <textarea maxLength={4000} name="narrative" rows={3} />
          </label>
          <label>
            Success criteria
            <textarea maxLength={2000} name="successCriteria" rows={2} />
          </label>
          <label>
            Target date (optional)
            <input name="targetDate" type="date" />
          </label>
          <button disabled={busy} type="submit">
            Save goal
          </button>
        </form>
      </section>

      <section className="panel goals-list" aria-labelledby="goals-heading">
        <h2 id="goals-heading">Goals</h2>
        {snapshot.goals.length === 0 ? (
          <p>No goals yet.</p>
        ) : (
          snapshot.goals.map((goal) => {
            const blockedBy = blockers.get(goal.resourceId) ?? [];
            return (
              <article className="goal-card" key={goal.id}>
                <header>
                  <div>
                    <p className="eyebrow">
                      {goal.type} · {goal.lifeDomain}
                    </p>
                    <h3>{goal.title}</h3>
                  </div>
                  <span className={`state-badge state-${goal.state}`}>
                    {goal.state}
                  </span>
                </header>
                <p>{goal.narrative || 'No narrative recorded.'}</p>
                <p>
                  <strong>Success:</strong>{' '}
                  {goal.successCriteria || 'Not yet specified.'}
                </p>
                <p>
                  <strong>Target:</strong> {goal.targetDate ?? 'Open-ended'}
                </p>
                <p className="resource-label">Goal ID: {goal.id}</p>
                {blockedBy.length > 0 ? (
                  <div className="guidance-note">
                    Blocked by{' '}
                    {blockedBy
                      .map((id) => goalNames.get(id) ?? 'another resource')
                      .join(', ')}
                    . This is dependency guidance, not a completion claim.
                  </div>
                ) : null}
                {nextStates(goal).length > 0 ? (
                  <div className="button-row">
                    {nextStates(goal).map((nextState) => (
                      <button
                        disabled={
                          busy ||
                          (nextState === 'active' &&
                            snapshot.guidance.requiresAcknowledgement &&
                            !acknowledgeLimit)
                        }
                        key={nextState}
                        onClick={() =>
                          void run(() => transition(goal, nextState))
                        }
                        type="button"
                      >
                        {nextState}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!['completed', 'retired', 'merged'].includes(goal.state) ? (
                  <details>
                    <summary>Edit</summary>
                    <form
                      className="goal-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => editGoal(event.currentTarget, goal));
                      }}
                    >
                      <input
                        defaultValue={goal.title}
                        maxLength={240}
                        name="title"
                        required
                      />
                      <select defaultValue={goal.type} name="type">
                        <option value="outcome">Outcome</option>
                        <option value="behavioural">Behavioural</option>
                      </select>
                      <input
                        defaultValue={goal.lifeDomain}
                        maxLength={100}
                        name="lifeDomain"
                        required
                      />
                      <textarea
                        defaultValue={goal.narrative}
                        maxLength={4000}
                        name="narrative"
                      />
                      <textarea
                        defaultValue={goal.successCriteria}
                        maxLength={2000}
                        name="successCriteria"
                      />
                      <input
                        defaultValue={goal.targetDate ?? ''}
                        name="targetDate"
                        type="date"
                      />
                      <button disabled={busy} type="submit">
                        Save edit
                      </button>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section className="panel relationship-panel">
        <h2>Goal relationships</h2>
        <p>
          Dependencies are explicit canonical edges. Cycles and cross-owner
          links fail closed.
        </p>
        <form
          className="goal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => createEdge(event.currentTarget));
          }}
        >
          <label>
            Source goal
            <select name="sourceResourceId" required>
              <option value="">Choose…</option>
              {snapshot.goals.map((goal) => (
                <option key={goal.id} value={goal.resourceId}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relationship
            <select defaultValue="depends_on" name="edgeType">
              <option value="depends_on">depends on</option>
              <option value="blocks">blocks</option>
              <option value="supports">supports</option>
              <option value="part_of">is part of</option>
              <option value="conflicts_with">conflicts with</option>
            </select>
          </label>
          <label>
            Target goal
            <select name="targetResourceId" required>
              <option value="">Choose…</option>
              {snapshot.goals.map((goal) => (
                <option key={goal.id} value={goal.resourceId}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || snapshot.goals.length < 2} type="submit">
            Add relationship
          </button>
        </form>
        <ul className="relationship-list">
          {snapshot.edges.map((edge) => (
            <li key={edge.id}>
              <span>
                {goalNames.get(edge.sourceResourceId) ?? 'Resource'}{' '}
                <strong>{edge.edgeType.replaceAll('_', ' ')}</strong>{' '}
                {goalNames.get(edge.targetResourceId) ?? 'resource'}
              </span>
              {edge.edgeType !== 'merged_into' ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const response = await post(
                        `/api/goals/edges/${edge.id}/remove`,
                        {
                          expectedVersion: edge.version,
                          ownerConfirmed: true,
                        },
                      );
                      edgeResponseV1Schema.parse(await response.json());
                      setMessage('Relationship removed; audit retained.');
                      await refresh();
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p aria-live="polite" className="form-message">
        {message}
      </p>
    </div>
  );
}
