'use client';

import {
  actionReceiptResponseV1Schema,
  agendaBlockResponseV1Schema,
  todayReceiptResponseV1Schema,
  todaySnapshotResponseV1Schema,
} from '@meridian/api-contracts';
import type {
  TodayReceiptResponseV1,
  TodaySnapshotResponseV1,
} from '@meridian/api-contracts';
import { useEffect, useMemo, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

function todayLocalDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function localDateTime(date: string): string {
  const value = new Date(date);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function displayTime(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function TodayApp() {
  const [date, setDate] = useState(todayLocalDate);
  const [state, setState] = useState<TodaySnapshotResponseV1 | null>(null);
  const [lastReceipt, setLastReceipt] = useState<TodayReceiptResponseV1 | null>(
    null,
  );
  const [message, setMessage] = useState('Loading Today…');
  const [busy, setBusy] = useState(false);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  async function refresh(selectedDate = date) {
    const query = new URLSearchParams({
      date: selectedDate,
      timeZone,
    });
    const response = await fetch(`/api/today?${query.toString()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Today could not be loaded.');
    setState(todaySnapshotResponseV1Schema.parse(await response.json()));
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open Today.');
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
    if (!response.ok)
      throw new Error('The owner-confirmed Today change was rejected.');
    return response;
  }

  async function lifecycle(path: string, expectedVersion: number) {
    const response = await post(path, {
      expectedVersion,
      ownerConfirmed: true,
    });
    setLastReceipt(todayReceiptResponseV1Schema.parse(await response.json()));
    await refresh();
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The Today change failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAgenda(form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await post('/api/today/agenda', {
      endsAt: new Date(formText(data, 'endsAt')).toISOString(),
      notes: formText(data, 'notes'),
      ownerConfirmed: true,
      startsAt: new Date(formText(data, 'startsAt')).toISOString(),
      timeZone,
      title: formText(data, 'title'),
    });
    agendaBlockResponseV1Schema.parse(await response.json());
    form.reset();
    setMessage('Local agenda block added. No calendar provider was called.');
    await refresh();
  }

  async function selectPriority(form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await post('/api/today/priorities', {
      localDate: date,
      ownerConfirmed: true,
      position: Number(formText(data, 'position')),
      taskId: formText(data, 'taskId'),
    });
    setLastReceipt(todayReceiptResponseV1Schema.parse(await response.json()));
    setMessage('Priority selected locally.');
    await refresh();
  }

  async function editTask(
    form: HTMLFormElement,
    item: NonNullable<TodaySnapshotResponseV1>['tasks'][number],
  ) {
    if (!item.receipt) return;
    const data = new FormData(form);
    const dueAt = formText(data, 'dueAt');
    const response = await post(
      `/api/actions/receipts/${item.receipt.id}/task`,
      {
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        estimateMinutes: item.task.estimateMinutes,
        expectedReceiptVersion: item.receipt.version,
        expectedTargetVersion: item.task.version,
        kind: item.task.kind,
        notes: formText(data, 'notes'),
        ownerConfirmed: true,
        title: formText(data, 'title'),
      },
    );
    actionReceiptResponseV1Schema.parse(await response.json());
    setMessage('Task edited locally; content was excluded from audit events.');
    await refresh();
  }

  async function editReminder(
    form: HTMLFormElement,
    item: NonNullable<TodaySnapshotResponseV1>['reminders'][number],
  ) {
    if (!item.receipt) return;
    const data = new FormData(form);
    const response = await post(
      `/api/actions/receipts/${item.receipt.id}/reminder`,
      {
        expiresAt: item.reminder.expiresAt,
        expectedReceiptVersion: item.receipt.version,
        expectedTargetVersion: item.reminder.version,
        ownerConfirmed: true,
        priority: item.reminder.priority,
        purpose: formText(data, 'purpose'),
        recurrence: item.reminder.recurrence,
        timeZone,
        triggerAt: new Date(formText(data, 'triggerAt')).toISOString(),
      },
    );
    actionReceiptResponseV1Schema.parse(await response.json());
    setMessage('Reminder edited locally. External delivery remains inactive.');
    await refresh();
  }

  async function editAgenda(
    form: HTMLFormElement,
    block: NonNullable<TodaySnapshotResponseV1>['agendaBlocks'][number],
  ) {
    const data = new FormData(form);
    const response = await post(`/api/today/agenda/${block.id}/edit`, {
      endsAt: new Date(formText(data, 'endsAt')).toISOString(),
      expectedVersion: block.version,
      notes: formText(data, 'notes'),
      ownerConfirmed: true,
      startsAt: new Date(formText(data, 'startsAt')).toISOString(),
      timeZone,
      title: formText(data, 'title'),
    });
    agendaBlockResponseV1Schema.parse(await response.json());
    setMessage('Agenda block edited locally.');
    await refresh();
  }

  async function undoLast() {
    if (lastReceipt?.status !== 'active') return;
    const response = await post(`/api/today/receipts/${lastReceipt.id}/undo`, {
      expectedVersion: lastReceipt.version,
      ownerConfirmed: true,
    });
    setLastReceipt(todayReceiptResponseV1Schema.parse(await response.json()));
    setMessage('The latest Today lifecycle change was undone.');
    await refresh();
  }

  const priorityByTask = new Map(
    (state?.priorities ?? []).map((priority) => [
      priority.taskId,
      priority.position,
    ]),
  );
  const selectableTasks =
    state?.tasks.filter(
      (item) =>
        !['done', 'dropped', 'superseded'].includes(item.task.state) &&
        !priorityByTask.has(item.task.id),
    ) ?? [];
  const freePositions = [1, 2, 3].filter(
    (position) =>
      !state?.priorities.some((priority) => priority.position === position),
  );

  return (
    <div className="today-layout" aria-live="polite">
      <section className="channel-status" role="status">
        <strong>External phone delivery is not active.</strong>
        <span>
          Reminder state shown here is Meridian in-app state only. No external
          notification is claimed.
        </span>
      </section>

      <div className="today-toolbar">
        <label>
          Local date
          <input
            type="date"
            value={date}
            onChange={(event) => {
              const nextDate = event.target.value;
              setDate(nextDate);
              void run(() => refresh(nextDate));
            }}
          />
        </label>
        <span>{timeZone}</span>
      </div>

      {message ? <p className="form-message">{message}</p> : null}

      {lastReceipt?.status === 'active' ? (
        <section className="undo-banner">
          <span>Latest change: {lastReceipt.action.replaceAll('_', ' ')}</span>
          <button disabled={busy} onClick={() => void run(undoLast)}>
            Undo
          </button>
        </section>
      ) : null}

      <section className="today-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Owner selected</p>
            <h2>Top three priorities</h2>
          </div>
          <span>{state?.priorities.length ?? 0}/3</span>
        </div>
        <ol className="priority-list">
          {state?.priorities.map((priority) => {
            const task = state.tasks.find(
              (item) => item.task.id === priority.taskId,
            )?.task;
            return (
              <li key={priority.id}>
                <span>{priority.position}</span>
                <strong>{task?.title ?? 'Unavailable task'}</strong>
              </li>
            );
          })}
        </ol>
        {freePositions.length > 0 && selectableTasks.length > 0 ? (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => selectPriority(event.currentTarget));
            }}
          >
            <label>
              Task
              <select name="taskId" required>
                {selectableTasks.map((item) => (
                  <option key={item.task.id} value={item.task.id}>
                    {item.task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Position
              <select name="position" required>
                {freePositions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Choose priority</button>
          </form>
        ) : null}
      </section>

      <section className="today-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Manual and local</p>
            <h2>Agenda</h2>
          </div>
          <span>{state?.agendaBlocks.length ?? 0} blocks</span>
        </div>
        <form
          className="agenda-create"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => createAgenda(event.currentTarget));
          }}
        >
          <label>
            Block
            <input name="title" required maxLength={240} />
          </label>
          <label>
            Starts
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Ends
            <input name="endsAt" type="datetime-local" required />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" maxLength={2000} />
          </label>
          <button disabled={busy}>Add local block</button>
        </form>
        <div className="today-cards">
          {state?.agendaBlocks.map((block) => (
            <article className="today-card" key={block.id}>
              <div className="card-title">
                <div>
                  <strong>{block.title}</strong>
                  <span>
                    {displayTime(block.startsAt)}–{displayTime(block.endsAt)}
                  </span>
                </div>
                <span className={`state-pill ${block.state}`}>
                  {block.state}
                </span>
              </div>
              {block.state === 'planned' ? (
                <>
                  <form
                    className="edit-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(() => editAgenda(event.currentTarget, block));
                    }}
                  >
                    <input
                      aria-label="Agenda title"
                      name="title"
                      defaultValue={block.title}
                      required
                    />
                    <input
                      aria-label="Agenda start"
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={localDateTime(block.startsAt)}
                      required
                    />
                    <input
                      aria-label="Agenda end"
                      name="endsAt"
                      type="datetime-local"
                      defaultValue={localDateTime(block.endsAt)}
                      required
                    />
                    <input
                      aria-label="Agenda notes"
                      name="notes"
                      defaultValue={block.notes}
                    />
                    <button disabled={busy}>Save edit</button>
                  </form>
                  <div className="button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          lifecycle(
                            `/api/today/agenda/${block.id}/complete`,
                            block.version,
                          ),
                        )
                      }
                    >
                      Complete
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          lifecycle(
                            `/api/today/agenda/${block.id}/cancel`,
                            block.version,
                          ),
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="today-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Canonical</p>
            <h2>Tasks</h2>
          </div>
          <a href="/actions">Add task</a>
        </div>
        <div className="today-cards">
          {state?.tasks.map((item) => (
            <article className="today-card" key={item.task.id}>
              <div className="card-title">
                <div>
                  <strong>{item.task.title}</strong>
                  <span>
                    {item.task.dueAt
                      ? `Due ${new Date(item.task.dueAt).toLocaleString()}`
                      : 'No due time'}
                  </span>
                </div>
                {priorityByTask.has(item.task.id) ? (
                  <span className="priority-pill">
                    Priority {priorityByTask.get(item.task.id)}
                  </span>
                ) : (
                  <span className={`state-pill ${item.task.state}`}>
                    {item.task.state}
                  </span>
                )}
              </div>
              {item.receipt &&
              ['open', 'scheduled'].includes(item.task.state) ? (
                <>
                  <form
                    className="edit-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(() => editTask(event.currentTarget, item));
                    }}
                  >
                    <input
                      aria-label="Task title"
                      name="title"
                      defaultValue={item.task.title}
                      required
                    />
                    <input
                      aria-label="Task notes"
                      name="notes"
                      defaultValue={item.task.notes}
                    />
                    <input
                      aria-label="Task due"
                      name="dueAt"
                      type="datetime-local"
                      defaultValue={
                        item.task.dueAt ? localDateTime(item.task.dueAt) : ''
                      }
                    />
                    <button disabled={busy}>Save edit</button>
                  </form>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        lifecycle(
                          `/api/today/tasks/${item.task.id}/complete`,
                          item.task.version,
                        ),
                      )
                    }
                  >
                    Complete
                  </button>
                </>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="today-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">In-app only</p>
            <h2>Reminders</h2>
          </div>
          <a href="/actions">Add reminder</a>
        </div>
        <div className="today-cards">
          {state?.reminders.map((item) => (
            <article className="today-card" key={item.reminder.id}>
              <div className="card-title">
                <div>
                  <strong>{item.reminder.purpose}</strong>
                  <span>{displayTime(item.reminder.triggerAt)}</span>
                </div>
                <span className={`state-pill ${item.reminder.state}`}>
                  {item.reminder.state}
                </span>
              </div>
              <p className="delivery-note">External delivery: inactive</p>
              {item.receipt &&
              ['scheduled', 'due', 'delivered'].includes(
                item.reminder.state,
              ) ? (
                <>
                  {item.reminder.state === 'scheduled' ? (
                    <form
                      className="edit-grid"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => editReminder(event.currentTarget, item));
                      }}
                    >
                      <input
                        aria-label="Reminder purpose"
                        name="purpose"
                        defaultValue={item.reminder.purpose}
                        required
                      />
                      <input
                        aria-label="Reminder trigger"
                        name="triggerAt"
                        type="datetime-local"
                        defaultValue={localDateTime(item.reminder.triggerAt)}
                        required
                      />
                      <button disabled={busy}>Save edit</button>
                    </form>
                  ) : null}
                  <div className="button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          lifecycle(
                            `/api/today/reminders/${item.reminder.id}/complete`,
                            item.reminder.version,
                          ),
                        )
                      }
                    >
                      Complete in Meridian
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          lifecycle(
                            `/api/today/reminders/${item.reminder.id}/dismiss`,
                            item.reminder.version,
                          ),
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
