import {
  agendaBlockIdV1Schema,
  agendaBlockStateV1Schema,
  createAgendaBlockInputV1Schema,
  dailyPriorityIdV1Schema,
  localDateV1Schema,
  resourceIdV1Schema,
  selectDailyPriorityInputV1Schema,
  taskIdV1Schema,
  timeZoneV1Schema,
  todayLifecycleActionV1Schema,
  todayReceiptIdV1Schema,
  todayTargetTypeV1Schema,
  updateAgendaBlockInputV1Schema,
} from '@meridian/domain';
import { z } from 'zod';
import {
  commandReceiptResponseV1Schema,
  reminderResponseV1Schema,
  taskResponseV1Schema,
} from './actions.js';

const dateTime = z.iso.datetime({ offset: true });

export const agendaBlockResponseV1Schema = z
  .object({
    createdAt: dateTime,
    endsAt: dateTime,
    id: agendaBlockIdV1Schema,
    notes: z.string(),
    resourceId: resourceIdV1Schema,
    startsAt: dateTime,
    state: agendaBlockStateV1Schema,
    timeZone: timeZoneV1Schema,
    title: z.string(),
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const dailyPriorityResponseV1Schema = z
  .object({
    createdAt: dateTime,
    id: dailyPriorityIdV1Schema,
    localDate: localDateV1Schema,
    position: z.number().int().min(1).max(3),
    taskId: taskIdV1Schema,
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const todayReceiptResponseV1Schema = z
  .object({
    action: todayLifecycleActionV1Schema,
    createdAt: dateTime,
    id: todayReceiptIdV1Schema,
    status: z.enum(['active', 'undone']),
    targetResourceId: resourceIdV1Schema,
    targetType: todayTargetTypeV1Schema,
    undoneAt: dateTime.nullable(),
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const todaySnapshotResponseV1Schema = z
  .object({
    agendaBlocks: z.array(agendaBlockResponseV1Schema),
    channel: z
      .object({
        externalDeliveryActive: z.literal(false),
        status: z.literal('inactive'),
      })
      .strict(),
    localDate: localDateV1Schema,
    priorities: z.array(dailyPriorityResponseV1Schema).max(3),
    reminders: z.array(
      z
        .object({
          receipt: commandReceiptResponseV1Schema.nullable(),
          reminder: reminderResponseV1Schema,
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          receipt: commandReceiptResponseV1Schema.nullable(),
          task: taskResponseV1Schema,
        })
        .strict(),
    ),
    timeZone: timeZoneV1Schema,
  })
  .strict();

export const createAgendaBlockRequestV1Schema = createAgendaBlockInputV1Schema;
export const updateAgendaBlockRequestV1Schema = updateAgendaBlockInputV1Schema;
export const selectDailyPriorityRequestV1Schema =
  selectDailyPriorityInputV1Schema;

export const todayLifecycleRequestV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export const todayUndoRequestV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export type TodaySnapshotResponseV1 = z.infer<
  typeof todaySnapshotResponseV1Schema
>;
export type TodayReceiptResponseV1 = z.infer<
  typeof todayReceiptResponseV1Schema
>;
