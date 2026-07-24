import {
  executionConfidenceClassV1Schema,
  executionEvidenceTypeV1Schema,
  executionOutcomeV1Schema,
  executionRecordIdV1Schema,
  executionSourceV1Schema,
  postBlockConfirmationInputV1Schema,
  reconcileElapsedBlocksInputV1Schema,
  taskIdV1Schema,
  todayReceiptIdV1Schema,
  weeklyReviewQueryV1Schema,
} from '@meridian/domain';
import { z } from 'zod';
import { calendarBlockResponseV1Schema } from './scheduling.js';

const instant = z.iso.datetime({ offset: true });

export const executionRecordResponseV1Schema = z
  .object({
    calendarBlockId: z.uuid().nullable(),
    confidenceClass: executionConfidenceClassV1Schema,
    evidenceType: executionEvidenceTypeV1Schema,
    id: executionRecordIdV1Schema,
    occurredAt: instant,
    outcome: executionOutcomeV1Schema,
    recordedAt: instant,
    reportedDurationMinutes: z.number().int().positive().nullable(),
    retractedAt: instant.nullable(),
    source: executionSourceV1Schema,
    sourceReceiptId: todayReceiptIdV1Schema.nullable(),
    taskId: taskIdV1Schema.nullable(),
  })
  .strict();

export const weeklyObservationResponseV1Schema = z
  .object({
    code: z.enum([
      'insufficient_evidence',
      'unknown_exceeds_confirmed',
      'confirmed_matches_plan',
      'postponements_repeated',
    ]),
    evidenceRecordIds: z.array(executionRecordIdV1Schema),
  })
  .strict();

export const weeklyReviewResponseV1Schema = z
  .object({
    completedTaskCount: z.number().int().nonnegative(),
    confirmedCompletedMinutes: z.number().int().nonnegative(),
    confirmedPartialMinutes: z.number().int().nonnegative(),
    explicitlyNotCompletedMinutes: z.number().int().nonnegative(),
    inbox: z.array(
      z
        .object({
          block: calendarBlockResponseV1Schema,
          record: executionRecordResponseV1Schema.nullable(),
          status: z.enum(['awaiting_confirmation', 'recorded']),
        })
        .strict(),
    ),
    observations: z.array(weeklyObservationResponseV1Schema).max(3),
    openTriageCount: z.number().int().nonnegative(),
    plannedMinutes: z.number().int().nonnegative(),
    postponedTaskEditCount: z.number().int().nonnegative(),
    reminderCompletedCount: z.number().int().nonnegative(),
    reminderDismissedCount: z.number().int().nonnegative(),
    rescheduledMinutes: z.number().int().nonnegative(),
    timeZone: z.string(),
    unknownElapsedMinutes: z.number().int().nonnegative(),
    weekEndsBefore: instant,
    weekStartsAt: instant,
    weekStartsOn: z.iso.date(),
  })
  .strict();

export const reconcileElapsedResponseV1Schema = z
  .object({ recorded: z.number().int().nonnegative() })
  .strict();

export const postBlockConfirmationRequestV1Schema =
  postBlockConfirmationInputV1Schema;
export const reconcileElapsedRequestV1Schema =
  reconcileElapsedBlocksInputV1Schema;
export const weeklyReviewRequestV1Schema = weeklyReviewQueryV1Schema;

export type WeeklyReviewResponseV1 = z.infer<
  typeof weeklyReviewResponseV1Schema
>;
