'use client';

import {
  actionListResponseV1Schema,
  actionReceiptResponseV1Schema,
} from '@meridian/api-contracts';
import type {
  ActionListResponseV1,
  ActionReceiptResponseV1,
} from '@meridian/api-contracts';
import { useEffect, useState } from 'react';
import { readCsrfCookie } from '../_components/auth-client';

const authority = {
  ambiguous: false,
  deterministic: true,
  explicit: true,
  externalEffect: false,
  ownerConfirmed: true,
} as const;

const empty: ActionListResponseV1 = { reminders: [], tasks: [] };

function localDateTime(date: string): string {
  const value = new Date(date);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function ActionsApp() {
  const [state, setState] = useState(empty);
  const [receipt, setReceipt] = useState<ActionReceiptResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading internal actions…');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch('/api/actions', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Actions could not be loaded.');
    setState(actionListResponseV1Schema.parse(await response.json()));
    setMessage('');
  }

  useEffect(() => {
    void refresh().catch(() => {
      setMessage('Sign in to open internal actions.');
    });
  }, []);

  async function command(path: string, body: unknown) {
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
      throw new Error('The owner-confirmed command was rejected.');
    const result = actionReceiptResponseV1Schema.parse(await response.json());
    setReceipt(result);
    await refresh();
    return result;
  }

  async function submitTask(form: HTMLFormElement) {
    const data = new FormData(form);
    const due = formText(data, 'due');
    const estimate = formText(data, 'estimate');
    await command('/api/actions/tasks', {
      authority,
      dueAt: due ? new Date(due).toISOString() : null,
      estimateMinutes: estimate ? Number(estimate) : null,
      goalResourceId: null,
      kind: formText(data, 'kind'),
      notes: formText(data, 'notes'),
      title: formText(data, 'title'),
    });
    form.reset();
    setMessage('Internal task created. Review the receipt below.');
  }

  async function submitReminderCommand(form: HTMLFormElement) {
    const data = new FormData(form);
    await command('/api/actions/commands/reminder', {
      command: formText(data, 'command'),
      ownerConfirmed: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    form.reset();
    setMessage(
      'The explicit time was resolved deterministically. No model or delivery provider was called.',
    );
  }

  async function submitReminder(form: HTMLFormElement) {
    const data = new FormData(form);
    const trigger = formText(data, 'trigger');
    const repeats = data.get('repeats') === 'on';
    await command('/api/actions/reminders', {
      authority,
      expiresAt: null,
      priority: formText(data, 'priority'),
      purpose: formText(data, 'purpose'),
      recurrence: repeats
        ? {
            frequency: 'daily',
            interval: Number(formText(data, 'interval')),
            schemaVersion: 1,
            until: null,
            weekDays: [],
          }
        : null,
      relatedResourceId: null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      triggerAt: new Date(trigger).toISOString(),
    });
    form.reset();
    setMessage(
      'Reminder intent scheduled internally; no delivery provider was called.',
    );
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed.');
    } finally {
      setBusy(false);
    }
  }

  async function editReceipt(form: HTMLFormElement) {
    if (receipt?.receipt.status !== 'active') return;
    const data = new FormData(form);
    if (receipt.target.targetType === 'task') {
      const task = receipt.target.task;
      const due = formText(data, 'edit-due');
      await command(`/api/actions/receipts/${receipt.receipt.id}/task`, {
        dueAt: due ? new Date(due).toISOString() : null,
        estimateMinutes: task.estimateMinutes,
        expectedReceiptVersion: receipt.receipt.version,
        expectedTargetVersion: task.version,
        kind: task.kind,
        notes: task.notes,
        ownerConfirmed: true,
        title: formText(data, 'edit-title'),
      });
    } else {
      const reminder = receipt.target.reminder;
      const trigger = formText(data, 'edit-trigger');
      await command(`/api/actions/receipts/${receipt.receipt.id}/reminder`, {
        expiresAt: reminder.expiresAt,
        expectedReceiptVersion: receipt.receipt.version,
        expectedTargetVersion: reminder.version,
        ownerConfirmed: true,
        priority: reminder.priority,
        purpose: formText(data, 'edit-purpose'),
        recurrence: reminder.recurrence,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        triggerAt: new Date(trigger).toISOString(),
      });
    }
    setMessage('Receipt target edited; the audit event retained no content.');
  }

  async function undo() {
    if (!receipt) return;
    await command(`/api/actions/receipts/${receipt.receipt.id}/undo`, {
      expectedVersion: receipt.receipt.version,
      ownerConfirmed: true,
    });
    setMessage(
      'Creation undone. The receipt and audit history remain visible.',
    );
  }

  return (
    <div className="action-layout" aria-live="polite">
      {message ? (
        <p className="form-message status-message">{message}</p>
      ) : null}
      <form
        className="auth-card quick-command-card"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => submitReminderCommand(event.currentTarget));
        }}
      >
        <h2>Quick reminder command</h2>
        <label>
          Exact format
          <input
            name="command"
            placeholder="Remind me tomorrow at 15:00 to email Margaret"
            required
          />
        </label>
        <p>
          Meridian accepts only this explicit grammar (or a YYYY-MM-DD date),
          rejects ambiguous daylight-saving times, and executes internally.
        </p>
        <button disabled={busy} type="submit">
          Resolve and create
        </button>
      </form>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => submitTask(event.currentTarget));
        }}
      >
        <h2>Explicit task</h2>
        <label>
          Title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Notes
          <textarea name="notes" maxLength={2000} />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue="task">
            <option value="task">Task</option>
            <option value="commitment">Commitment</option>
            <option value="routine">Routine</option>
            <option value="milestone">Milestone</option>
          </select>
        </label>
        <label>
          Due (optional)
          <input name="due" type="datetime-local" />
        </label>
        <label>
          Estimate in minutes (optional)
          <input name="estimate" type="number" min="1" max="10080" />
        </label>
        <button disabled={busy} type="submit">
          Create internal task
        </button>
      </form>

      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => submitReminder(event.currentTarget));
        }}
      >
        <h2>Explicit reminder</h2>
        <label>
          Purpose
          <input name="purpose" required maxLength={500} />
        </label>
        <label>
          Trigger
          <input name="trigger" type="datetime-local" required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="inline-choice">
          <input name="repeats" type="checkbox" /> Repeat daily
        </label>
        <label>
          Repeat interval (days)
          <input
            name="interval"
            type="number"
            min="1"
            max="52"
            defaultValue="1"
          />
        </label>
        <button disabled={busy} type="submit">
          Create reminder intent
        </button>
      </form>

      {receipt ? (
        <section className="auth-card receipt-card">
          <p className="eyebrow">Command receipt</p>
          <h2>{receipt.receipt.targetType}</h2>
          <dl>
            <div>
              <dt>Receipt</dt>
              <dd>{receipt.receipt.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{receipt.receipt.status}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>internal only</dd>
            </div>
          </dl>
          {receipt.receipt.status === 'active' ? (
            <form
              className="triage-edit"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => editReceipt(event.currentTarget));
              }}
            >
              {receipt.target.targetType === 'task' ? (
                <>
                  <label>
                    Edit title
                    <input
                      name="edit-title"
                      defaultValue={receipt.target.task.title}
                      required
                    />
                  </label>
                  <label>
                    Edit due
                    <input
                      name="edit-due"
                      type="datetime-local"
                      defaultValue={
                        receipt.target.task.dueAt
                          ? localDateTime(receipt.target.task.dueAt)
                          : ''
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Edit purpose
                    <input
                      name="edit-purpose"
                      defaultValue={receipt.target.reminder.purpose}
                      required
                    />
                  </label>
                  <label>
                    Edit trigger
                    <input
                      name="edit-trigger"
                      type="datetime-local"
                      defaultValue={localDateTime(
                        receipt.target.reminder.triggerAt,
                      )}
                      required
                    />
                  </label>
                </>
              )}
              <div className="button-row">
                <button disabled={busy} type="submit">
                  Save edit
                </button>
                <button
                  className="button-danger"
                  disabled={busy}
                  onClick={() => void run(undo)}
                  type="button"
                >
                  Undo creation
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="action-ledger">
        <h2>Canonical records</h2>
        {[...state.reminders, ...state.tasks].map((item) => (
          <article className="auth-card action-card" key={item.id}>
            <div className="entry-meta">
              <span>{'purpose' in item ? 'reminder' : item.kind}</span>
              <span>{item.state}</span>
            </div>
            <h3>{'purpose' in item ? item.purpose : item.title}</h3>
            {'triggerAt' in item ? (
              <p>
                {new Date(item.triggerAt).toLocaleString()} · delivery{' '}
                {item.deliveryPolicy}
              </p>
            ) : null}
            <small>{item.creationAuthority.replaceAll('_', ' ')}</small>
          </article>
        ))}
      </section>
    </div>
  );
}
