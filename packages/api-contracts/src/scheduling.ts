import {
  acceptSchedulingProposalInputV1Schema,
  calendarBlockIdV1Schema,
  createSchedulingProposalInputV1Schema,
  goalIdV1Schema,
  resourceIdV1Schema,
  schedulingCandidateV1Schema,
  schedulingProposalIdV1Schema,
  schedulingProposalStateV1Schema,
  schedulingVerdictV1Schema,
  taskIdV1Schema,
} from '@meridian/domain';
import { z } from 'zod';
import { goalResponseV1Schema } from './goals.js';
import { taskResponseV1Schema } from './actions.js';

const instant = z.iso.datetime({ offset: true });

export const schedulingProposalResponseV1Schema = z
  .object({
    alternatives: z.array(z.string()),
    bufferMinutes: z.number().int().nonnegative(),
    candidates: z.array(schedulingCandidateV1Schema),
    capacityMinutes: z.number().int().nonnegative(),
    createdAt: instant,
    deadline: instant,
    earliestStart: instant,
    estimatedEffortMinutes: z.number().int().positive(),
    exclusions: z.array(z.string()),
    goalId: goalIdV1Schema.nullable(),
    id: schedulingProposalIdV1Schema,
    maxBlockMinutes: z.number().int().positive(),
    maxDeepWorkMinutesPerDay: z.number().int().positive(),
    minBlockMinutes: z.number().int().positive(),
    scheduledMinutes: z.number().int().nonnegative(),
    state: schedulingProposalStateV1Schema,
    taskId: taskIdV1Schema.nullable(),
    timeZone: z.string(),
    title: z.string(),
    updatedAt: instant,
    verdict: schedulingVerdictV1Schema,
    version: z.number().int().positive(),
    workingWindows: z.array(
      z.object({ endsAt: instant, startsAt: instant }).strict(),
    ),
  })
  .strict();

export const calendarBlockResponseV1Schema = z
  .object({
    approvalRecordedAt: instant,
    createdAt: instant,
    currentEndsAt: instant,
    currentStartsAt: instant,
    goalId: goalIdV1Schema.nullable(),
    id: calendarBlockIdV1Schema,
    ordinal: z.number().int().positive(),
    originalEndsAt: instant,
    originalStartsAt: instant,
    plannedEffortMinutes: z.number().int().positive(),
    proposalId: schedulingProposalIdV1Schema,
    resourceId: resourceIdV1Schema,
    state: z.enum(['planned', 'cancelled']),
    taskId: taskIdV1Schema.nullable(),
    timeZone: z.string(),
    title: z.string(),
    updatedAt: instant,
    version: z.number().int().positive(),
  })
  .strict();

export const schedulingSnapshotResponseV1Schema = z
  .object({
    blocks: z.array(calendarBlockResponseV1Schema),
    goals: z.array(goalResponseV1Schema),
    proposals: z.array(schedulingProposalResponseV1Schema),
    providerStatus: z.literal('not_configured'),
    tasks: z.array(taskResponseV1Schema),
  })
  .strict();

export const createSchedulingProposalRequestV1Schema =
  createSchedulingProposalInputV1Schema;
export const schedulingProposalDecisionRequestV1Schema =
  acceptSchedulingProposalInputV1Schema;

export type SchedulingSnapshotResponseV1 = z.infer<
  typeof schedulingSnapshotResponseV1Schema
>;
