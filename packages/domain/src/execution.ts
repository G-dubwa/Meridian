import { z } from 'zod';
import {
  calendarBlockIdV1Schema,
  executionRecordIdV1Schema,
  taskIdV1Schema,
  todayReceiptIdV1Schema,
} from './ids.js';
import { localDateV1Schema } from './today.js';
import { timeZoneV1Schema } from './action.js';

export const executionEvidenceTypeV1Schema = z.enum([
  'user_completed_task',
  'post_block_confirmed',
  'focus_session_recorded',
  'external_task_completed',
  'calendar_elapsed_unknown',
  'user_reported_not_done',
]);
export type ExecutionEvidenceType = z.infer<
  typeof executionEvidenceTypeV1Schema
>;

export const executionConfidenceClassV1Schema = z.enum([
  'owner_confirmed',
  'locally_observed',
  'externally_confirmed',
  'unknown',
]);
export type ExecutionConfidenceClass = z.infer<
  typeof executionConfidenceClassV1Schema
>;

export function confidenceClassForEvidenceV1(
  evidenceType: ExecutionEvidenceType,
): ExecutionConfidenceClass {
  switch (evidenceType) {
    case 'user_completed_task':
    case 'post_block_confirmed':
    case 'user_reported_not_done':
      return 'owner_confirmed';
    case 'focus_session_recorded':
      return 'locally_observed';
    case 'external_task_completed':
      return 'externally_confirmed';
    case 'calendar_elapsed_unknown':
      return 'unknown';
  }
}

export const executionOutcomeV1Schema = z.enum([
  'confirmed_completed',
  'confirmed_partial',
  'unknown',
  'not_completed',
  'rescheduled',
]);
export type ExecutionOutcome = z.infer<typeof executionOutcomeV1Schema>;

export const executionSourceV1Schema = z.enum([
  'today_task_completion',
  'post_block_confirmation',
  'elapsed_block_reconciliation',
]);
export type ExecutionSource = z.infer<typeof executionSourceV1Schema>;

export const postBlockResponseV1Schema = z.enum([
  'done',
  'partly_done',
  'not_done',
  'rescheduled',
  'skip',
]);
export type PostBlockResponse = z.infer<typeof postBlockResponseV1Schema>;

export const postBlockConfirmationInputV1Schema = z
  .object({
    expectedBlockVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    reportedDurationMinutes: z.number().int().positive().nullable(),
    response: postBlockResponseV1Schema,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.response === 'partly_done' &&
      input.reportedDurationMinutes === null
    )
      context.addIssue({
        code: 'custom',
        message: 'Partial completion requires a reported duration.',
        path: ['reportedDurationMinutes'],
      });
    if (
      input.response !== 'partly_done' &&
      input.reportedDurationMinutes !== null
    )
      context.addIssue({
        code: 'custom',
        message: 'Only partial completion accepts a reported duration.',
        path: ['reportedDurationMinutes'],
      });
  });

export const reconcileElapsedBlocksInputV1Schema = z
  .object({
    through: z.iso.datetime({ offset: true }),
  })
  .strict();

export const weeklyReviewQueryV1Schema = z
  .object({
    weekStartsOn: localDateV1Schema,
    timeZone: timeZoneV1Schema,
  })
  .strict();

export const executionEventTypeV1Schema = z.enum([
  'execution.recorded.v1',
  'execution.record_retracted.v1',
  'execution.elapsed_reconciled.v1',
]);
export type ExecutionEventType = z.infer<typeof executionEventTypeV1Schema>;

export const executionEventPayloadV1Schema = z
  .object({
    calendarBlockId: calendarBlockIdV1Schema.nullable(),
    confidenceClass: executionConfidenceClassV1Schema,
    evidenceType: executionEvidenceTypeV1Schema,
    executionRecordId: executionRecordIdV1Schema,
    outcome: executionOutcomeV1Schema,
    taskId: taskIdV1Schema.nullable(),
  })
  .strict();

export const executionRecordReferenceV1Schema = z
  .object({
    id: executionRecordIdV1Schema,
    sourceReceiptId: todayReceiptIdV1Schema.nullable(),
  })
  .strict();
