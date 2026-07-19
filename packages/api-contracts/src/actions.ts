import {
  commandReceiptIdV1Schema,
  commandReceiptStatusV1Schema,
  createReminderInputV1Schema,
  createTaskInputV1Schema,
  creationAuthorityV1Schema,
  proposalIdV1Schema,
  recurrenceRuleV1Schema,
  reminderDeliveryPolicyV1Schema,
  reminderIdV1Schema,
  reminderPriorityV1Schema,
  reminderQuietHoursBehaviorV1Schema,
  reminderStateV1Schema,
  resourceIdV1Schema,
  taskIdV1Schema,
  taskKindV1Schema,
  taskStateV1Schema,
  timeZoneV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

const dateTime = z.iso.datetime({ offset: true });

export const taskResponseV1Schema = z
  .object({
    id: taskIdV1Schema,
    resourceId: resourceIdV1Schema,
    goalResourceId: resourceIdV1Schema.nullable(),
    kind: taskKindV1Schema,
    title: z.string(),
    notes: z.string(),
    estimateMinutes: z.number().int().nullable(),
    dueAt: dateTime.nullable(),
    state: taskStateV1Schema,
    creationAuthority: creationAuthorityV1Schema,
    sourceProposalId: proposalIdV1Schema.nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const reminderResponseV1Schema = z
  .object({
    id: reminderIdV1Schema,
    resourceId: resourceIdV1Schema,
    relatedResourceId: resourceIdV1Schema.nullable(),
    purpose: z.string(),
    triggerAt: dateTime,
    timeZone: timeZoneV1Schema,
    recurrence: recurrenceRuleV1Schema.nullable(),
    deliveryPolicy: reminderDeliveryPolicyV1Schema,
    priority: reminderPriorityV1Schema,
    quietHoursBehavior: reminderQuietHoursBehaviorV1Schema,
    expiresAt: dateTime.nullable(),
    state: reminderStateV1Schema,
    creationAuthority: creationAuthorityV1Schema,
    sourceProposalId: proposalIdV1Schema.nullable(),
    ownerFeedback: z.string().nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const commandReceiptResponseV1Schema = z
  .object({
    id: commandReceiptIdV1Schema,
    targetResourceId: resourceIdV1Schema,
    targetType: z.enum(['task', 'reminder']),
    status: commandReceiptStatusV1Schema,
    createdAt: dateTime,
    updatedAt: dateTime,
    undoneAt: dateTime.nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const actionTargetResponseV1Schema = z.discriminatedUnion('targetType', [
  z
    .object({ targetType: z.literal('task'), task: taskResponseV1Schema })
    .strict(),
  z
    .object({
      targetType: z.literal('reminder'),
      reminder: reminderResponseV1Schema,
    })
    .strict(),
]);

export const actionReceiptResponseV1Schema = z
  .object({
    receipt: commandReceiptResponseV1Schema,
    target: actionTargetResponseV1Schema,
  })
  .strict();

export const actionListResponseV1Schema = z
  .object({
    reminders: z.array(reminderResponseV1Schema),
    tasks: z.array(taskResponseV1Schema),
  })
  .strict();

export const createTaskRequestV1Schema = createTaskInputV1Schema;
export const createReminderRequestV1Schema = createReminderInputV1Schema;

export const explicitReminderCommandRequestV1Schema = z
  .object({
    command: z.string().trim().min(1).max(1_000),
    ownerConfirmed: z.literal(true),
    timeZone: timeZoneV1Schema,
  })
  .strict();

export const undoCommandReceiptRequestV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export const editTaskReceiptRequestV1Schema = z
  .object({
    dueAt: dateTime.nullable(),
    estimateMinutes: z.number().int().min(1).max(10_080).nullable(),
    expectedReceiptVersion: z.number().int().positive(),
    expectedTargetVersion: z.number().int().positive(),
    kind: taskKindV1Schema,
    notes: z.string().trim().max(2_000),
    ownerConfirmed: z.literal(true),
    title: z.string().trim().min(1).max(240),
  })
  .strict();

export const editReminderReceiptRequestV1Schema = z
  .object({
    expiresAt: dateTime.nullable(),
    expectedReceiptVersion: z.number().int().positive(),
    expectedTargetVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    priority: reminderPriorityV1Schema,
    purpose: z.string().trim().min(1).max(500),
    recurrence: recurrenceRuleV1Schema.nullable(),
    timeZone: timeZoneV1Schema,
    triggerAt: dateTime,
  })
  .strict();

export const acceptedReminderDetailsV1Schema = z
  .object({
    expiresAt: dateTime.nullable(),
    priority: reminderPriorityV1Schema,
    recurrence: recurrenceRuleV1Schema.nullable(),
    timeZone: timeZoneV1Schema,
    triggerAt: dateTime,
  })
  .strict();

export type ActionListResponseV1 = z.infer<typeof actionListResponseV1Schema>;
export type ActionReceiptResponseV1 = z.infer<
  typeof actionReceiptResponseV1Schema
>;
