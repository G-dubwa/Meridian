import { z } from 'zod';
import { timeZoneV1Schema } from './action.js';
import { DomainValidationError } from './errors.js';
import {
  agendaBlockIdV1Schema,
  dailyPriorityIdV1Schema,
  resourceIdV1Schema,
  taskIdV1Schema,
  todayReceiptIdV1Schema,
} from './ids.js';

export const localDateV1Schema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .superRefine((value, context) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      context.addIssue({
        code: 'custom',
        message: 'The local calendar date is invalid.',
      });
  });
export type LocalDateV1 = z.infer<typeof localDateV1Schema>;

export const agendaBlockStateV1Schema = z.enum([
  'planned',
  'completed',
  'cancelled',
]);
export type AgendaBlockState = z.infer<typeof agendaBlockStateV1Schema>;

export const agendaBlockTitleV1Schema = z.string().trim().min(1).max(240);
export const agendaBlockNotesV1Schema = z.string().trim().max(2_000);

export const createAgendaBlockInputV1Schema = z
  .object({
    endsAt: z.iso.datetime({ offset: true }),
    notes: agendaBlockNotesV1Schema,
    ownerConfirmed: z.literal(true),
    startsAt: z.iso.datetime({ offset: true }),
    timeZone: timeZoneV1Schema,
    title: agendaBlockTitleV1Schema,
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      context.addIssue({
        code: 'custom',
        message: 'Agenda block end must follow its start.',
        path: ['endsAt'],
      });
    if (Date.parse(input.endsAt) - Date.parse(input.startsAt) > 86_400_000)
      context.addIssue({
        code: 'custom',
        message: 'Agenda blocks cannot exceed 24 hours.',
        path: ['endsAt'],
      });
  });

export const updateAgendaBlockInputV1Schema = z
  .object({
    endsAt: z.iso.datetime({ offset: true }),
    expectedVersion: z.number().int().positive(),
    notes: agendaBlockNotesV1Schema,
    ownerConfirmed: z.literal(true),
    startsAt: z.iso.datetime({ offset: true }),
    timeZone: timeZoneV1Schema,
    title: agendaBlockTitleV1Schema,
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      context.addIssue({
        code: 'custom',
        message: 'Agenda block end must follow its start.',
        path: ['endsAt'],
      });
    if (Date.parse(input.endsAt) - Date.parse(input.startsAt) > 86_400_000)
      context.addIssue({
        code: 'custom',
        message: 'Agenda blocks cannot exceed 24 hours.',
        path: ['endsAt'],
      });
  });

export const selectDailyPriorityInputV1Schema = z
  .object({
    localDate: localDateV1Schema,
    ownerConfirmed: z.literal(true),
    position: z.number().int().min(1).max(3),
    taskId: taskIdV1Schema,
  })
  .strict();

export const todayLifecycleActionV1Schema = z.enum([
  'task_completed',
  'reminder_completed',
  'reminder_dismissed',
  'agenda_completed',
  'agenda_cancelled',
  'priority_selected',
]);
export type TodayLifecycleAction = z.infer<typeof todayLifecycleActionV1Schema>;

export const todayTargetTypeV1Schema = z.enum([
  'task',
  'reminder',
  'agenda_block',
  'priority',
]);
export type TodayTargetType = z.infer<typeof todayTargetTypeV1Schema>;

export const todayEventTypeV1Schema = z.enum([
  'today.agenda_block_created.v1',
  'today.agenda_block_updated.v1',
  'today.priority_selected.v1',
  'today.task_completed.v1',
  'today.reminder_completed.v1',
  'today.reminder_dismissed.v1',
  'today.agenda_block_completed.v1',
  'today.agenda_block_cancelled.v1',
  'today.change_undone.v1',
]);
export type TodayEventType = z.infer<typeof todayEventTypeV1Schema>;

export const todayEventPayloadV1Schema = z
  .object({
    action: z.string().min(1).max(60),
    receiptId: todayReceiptIdV1Schema.nullable(),
    targetResourceId: resourceIdV1Schema,
    targetType: todayTargetTypeV1Schema,
  })
  .strict();

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
    const actual = localParts(candidate, timeZone);
    if (
      actual.year === target.year &&
      actual.month === target.month &&
      actual.day === target.day &&
      actual.hour === target.hour &&
      actual.minute === target.minute
    )
      matches.push(candidate);
  }
  if (matches.length !== 1)
    throw new DomainValidationError(
      matches.length === 0
        ? 'The local date boundary does not exist in this time zone.'
        : 'The local date boundary is ambiguous in this time zone.',
    );
  const match = matches[0];
  if (!match)
    throw new DomainValidationError('The local date boundary is unresolved.');
  return match;
}

export function localDateBoundsV1(
  localDate: string,
  rawTimeZone: string,
): { readonly end: Date; readonly start: Date } {
  const date = localDateV1Schema.parse(localDate);
  const timeZone = timeZoneV1Schema.parse(rawTimeZone);
  const midnight = new Date(`${date}T00:00:00.000Z`);
  const start = resolveLocalInstant(
    {
      day: midnight.getUTCDate(),
      hour: 0,
      minute: 0,
      month: midnight.getUTCMonth() + 1,
      year: midnight.getUTCFullYear(),
    },
    timeZone,
  );
  const following = new Date(midnight.getTime() + 86_400_000);
  const end = resolveLocalInstant(
    {
      day: following.getUTCDate(),
      hour: 0,
      minute: 0,
      month: following.getUTCMonth() + 1,
      year: following.getUTCFullYear(),
    },
    timeZone,
  );
  return { end, start };
}

export const agendaBlockViewIdentityV1Schema = z
  .object({ id: agendaBlockIdV1Schema })
  .strict();
export const dailyPriorityViewIdentityV1Schema = z
  .object({ id: dailyPriorityIdV1Schema })
  .strict();
