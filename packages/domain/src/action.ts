import { z } from 'zod';
import { DomainValidationError, InvalidAuthorityError } from './errors.js';
import {
  commandReceiptIdV1Schema,
  reminderIdV1Schema,
  resourceIdV1Schema,
  taskIdV1Schema,
} from './ids.js';

export const taskKindV1Schema = z.enum([
  'task',
  'commitment',
  'routine',
  'milestone',
]);
export type TaskKind = z.infer<typeof taskKindV1Schema>;
export const taskStateV1Schema = z.enum([
  'open',
  'scheduled',
  'done',
  'dropped',
  'superseded',
]);
export type TaskState = z.infer<typeof taskStateV1Schema>;

export const reminderStateV1Schema = z.enum([
  'scheduled',
  'due',
  'delivered',
  'completed',
  'dismissed',
  'snoozed',
  'paused',
  'expired',
]);
export type ReminderState = z.infer<typeof reminderStateV1Schema>;

export const reminderOccurrenceStateV1Schema = z.enum([
  'pending',
  'due',
  'acknowledged',
  'dismissed',
  'cancelled',
]);
export type ReminderOccurrenceState = z.infer<
  typeof reminderOccurrenceStateV1Schema
>;

export const creationAuthorityV1Schema = z.enum([
  'manual',
  'explicit_command',
  'accepted_proposal',
]);
export type CreationAuthority = z.infer<typeof creationAuthorityV1Schema>;

export const recurrenceRuleV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    frequency: z.enum(['daily', 'weekly']),
    interval: z.number().int().min(1).max(52),
    weekDays: z.array(z.number().int().min(1).max(7)).max(7),
    until: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.frequency === 'daily' && rule.weekDays.length !== 0)
      context.addIssue({
        code: 'custom',
        message: 'Daily recurrence cannot select weekdays.',
        path: ['weekDays'],
      });
    if (new Set(rule.weekDays).size !== rule.weekDays.length)
      context.addIssue({
        code: 'custom',
        message: 'Recurrence weekdays must be unique.',
        path: ['weekDays'],
      });
  });
export type RecurrenceRuleV1 = z.infer<typeof recurrenceRuleV1Schema>;

export const timeZoneV1Schema = z
  .string()
  .min(1)
  .max(100)
  .superRefine((timeZone, context) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(new Date(0));
    } catch {
      context.addIssue({ code: 'custom', message: 'Time zone is invalid.' });
    }
  });

export const commandReceiptStatusV1Schema = z.enum(['active', 'undone']);
export type CommandReceiptStatus = z.infer<typeof commandReceiptStatusV1Schema>;

export const taskTitleV1Schema = z.string().trim().min(1).max(240);
export const taskNotesV1Schema = z.string().trim().max(2_000);
export const reminderPurposeV1Schema = z.string().trim().min(1).max(500);
export const reminderPriorityV1Schema = z.enum(['low', 'normal', 'high']);
export type ReminderPriority = z.infer<typeof reminderPriorityV1Schema>;
export const reminderDeliveryPolicyV1Schema = z.literal('undecided');
export const reminderQuietHoursBehaviorV1Schema = z.literal('defer');

export const explicitCommandAuthorityV1Schema = z
  .object({
    ambiguous: z.literal(false),
    deterministic: z.literal(true),
    explicit: z.literal(true),
    externalEffect: z.literal(false),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export const createTaskInputV1Schema = z
  .object({
    authority: explicitCommandAuthorityV1Schema,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    estimateMinutes: z.number().int().min(1).max(10_080).nullable(),
    goalResourceId: resourceIdV1Schema.nullable(),
    kind: taskKindV1Schema,
    notes: taskNotesV1Schema,
    title: taskTitleV1Schema,
  })
  .strict();

export const createReminderInputV1Schema = z
  .object({
    authority: explicitCommandAuthorityV1Schema,
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    priority: reminderPriorityV1Schema,
    purpose: reminderPurposeV1Schema,
    recurrence: recurrenceRuleV1Schema.nullable(),
    relatedResourceId: resourceIdV1Schema.nullable(),
    timeZone: timeZoneV1Schema,
    triggerAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.expiresAt !== null &&
      Date.parse(input.expiresAt) <= Date.parse(input.triggerAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Reminder expiry must follow its trigger.',
        path: ['expiresAt'],
      });
    }
  });

export function transitionTaskStateV1(
  current: TaskState,
  next: TaskState,
): TaskState {
  const allowed: Readonly<Record<TaskState, readonly TaskState[]>> = {
    open: ['scheduled', 'done', 'dropped', 'superseded'],
    scheduled: ['open', 'done', 'dropped', 'superseded'],
    done: [],
    dropped: [],
    superseded: [],
  };
  if (!allowed[current].includes(next))
    throw new DomainValidationError('Task state transition is invalid.');
  return next;
}

export function transitionReminderStateV1(
  current: ReminderState,
  next: ReminderState,
): ReminderState {
  const allowed: Readonly<Record<ReminderState, readonly ReminderState[]>> = {
    scheduled: ['due', 'paused', 'expired', 'dismissed'],
    due: ['delivered', 'completed', 'dismissed', 'snoozed'],
    delivered: ['completed', 'dismissed', 'snoozed'],
    snoozed: ['scheduled'],
    paused: ['scheduled'],
    completed: [],
    dismissed: [],
    expired: [],
  };
  if (!allowed[current].includes(next))
    throw new DomainValidationError('Reminder state transition is invalid.');
  return next;
}

export function assertDirectCommandAuthorityV1(input: {
  readonly explicit: boolean;
  readonly deterministic: boolean;
  readonly ambiguous: boolean;
  readonly externalEffect: boolean;
}): void {
  if (
    !input.explicit ||
    !input.deterministic ||
    input.ambiguous ||
    input.externalEffect
  )
    throw new InvalidAuthorityError(
      'Direct execution requires an explicit, deterministic, unambiguous internal command.',
    );
}

interface LocalDateTimeParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly year: number;
}

function localParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    month: value('month'),
    year: value('year'),
  };
}

function matchesLocal(
  date: Date,
  target: LocalDateTimeParts,
  timeZone: string,
): boolean {
  const actual = localParts(date, timeZone);
  return (Object.keys(target) as (keyof LocalDateTimeParts)[]).every(
    (key) => actual[key] === target[key],
  );
}

function resolveLocalInstant(
  target: LocalDateTimeParts,
  timeZone: string,
): Date {
  const wallClockAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const matches: Date[] = [];
  for (
    let minuteOffset = -14 * 60;
    minuteOffset <= 14 * 60;
    minuteOffset += 1
  ) {
    const candidate = new Date(wallClockAsUtc + minuteOffset * 60_000);
    if (matchesLocal(candidate, target, timeZone)) matches.push(candidate);
  }
  if (matches.length !== 1)
    throw new DomainValidationError(
      matches.length === 0
        ? 'The local reminder time does not exist in this time zone.'
        : 'The local reminder time is ambiguous in this time zone.',
    );
  const resolved = matches[0];
  if (!resolved)
    throw new DomainValidationError('The local reminder time is unresolved.');
  return resolved;
}

export function resolveExplicitReminderCommandV1(input: {
  readonly command: string;
  readonly now: Date;
  readonly timeZone: string;
}): {
  readonly purpose: string;
  readonly timeZone: string;
  readonly triggerAt: string;
} {
  const timeZone = timeZoneV1Schema.parse(input.timeZone);
  const match =
    /^remind me (tomorrow|\d{4}-\d{2}-\d{2}) at ([01]\d|2[0-3]):([0-5]\d) to (.+)$/iu.exec(
      input.command.trim(),
    );
  if (!match)
    throw new DomainValidationError(
      'Use “Remind me tomorrow at HH:MM to …” or an ISO calendar date.',
    );
  const [, datePhrase, hourText, minuteText, purposeText] = match;
  if (!datePhrase || !hourText || !minuteText || !purposeText)
    throw new DomainValidationError('The reminder command is incomplete.');
  const base = localParts(input.now, timeZone);
  const date =
    datePhrase.toLowerCase() === 'tomorrow'
      ? new Date(Date.UTC(base.year, base.month - 1, base.day + 1))
      : new Date(`${datePhrase}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new DomainValidationError('The reminder date is invalid.');
  const target = {
    day: date.getUTCDate(),
    hour: Number(hourText),
    minute: Number(minuteText),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
  if (
    datePhrase !== 'tomorrow' &&
    `${target.year.toString().padStart(4, '0')}-${target.month
      .toString()
      .padStart(2, '0')}-${target.day.toString().padStart(2, '0')}` !==
      datePhrase
  )
    throw new DomainValidationError('The reminder calendar date is invalid.');
  const trigger = resolveLocalInstant(target, timeZone);
  if (trigger <= input.now)
    throw new DomainValidationError(
      'The reminder trigger must be in the future.',
    );
  const purpose = purposeText.trim().replace(/\.$/u, '').trim();
  if (!purpose)
    throw new DomainValidationError('The reminder purpose is required.');
  return {
    purpose: reminderPurposeV1Schema.parse(purpose),
    timeZone,
    triggerAt: trigger.toISOString(),
  };
}

export const actionEventTypeV1Schema = z.enum([
  'action.task_created.v1',
  'action.task_updated.v1',
  'action.task_completed.v1',
  'action.reminder_created.v1',
  'action.reminder_updated.v1',
  'action.receipt_undone.v1',
]);
export type ActionEventType = z.infer<typeof actionEventTypeV1Schema>;

export const actionEventPayloadV1Schema = z
  .object({
    targetResourceId: resourceIdV1Schema,
    targetType: z.enum(['task', 'reminder']),
    targetState: z.string().min(1).max(40),
    receiptId: commandReceiptIdV1Schema.nullable(),
  })
  .strict();

export const taskViewIdentityV1Schema = z
  .object({ id: taskIdV1Schema })
  .strict();
export const reminderViewIdentityV1Schema = z
  .object({ id: reminderIdV1Schema })
  .strict();
