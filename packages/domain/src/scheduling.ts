import { z } from 'zod';
import { timeZoneV1Schema } from './action.js';
import {
  calendarBlockIdV1Schema,
  goalIdV1Schema,
  schedulingProposalIdV1Schema,
  taskIdV1Schema,
} from './ids.js';

const instantSchema = z.iso.datetime({ offset: true });

export const schedulingIntervalV1Schema = z
  .object({
    endsAt: instantSchema,
    startsAt: instantSchema,
  })
  .strict()
  .superRefine((interval, context) => {
    if (Date.parse(interval.endsAt) <= Date.parse(interval.startsAt))
      context.addIssue({
        code: 'custom',
        message: 'The interval end must follow its start.',
        path: ['endsAt'],
      });
  });

export const schedulingVerdictV1Schema = z.enum([
  'feasible',
  'tight',
  'infeasible',
]);
export type SchedulingVerdict = z.infer<typeof schedulingVerdictV1Schema>;

export const schedulingProposalStateV1Schema = z.enum([
  'pending',
  'accepted',
  'dismissed',
  'stale',
]);
export type SchedulingProposalState = z.infer<
  typeof schedulingProposalStateV1Schema
>;

export const schedulingCandidateV1Schema = schedulingIntervalV1Schema.extend({
  minutes: z.number().int().positive(),
  ordinal: z.number().int().positive(),
});
export type SchedulingCandidate = z.infer<typeof schedulingCandidateV1Schema>;

export const createSchedulingProposalInputV1Schema = z
  .object({
    bufferMinutes: z.number().int().min(0).max(240),
    deadline: instantSchema,
    earliestStart: instantSchema,
    estimatedEffortMinutes: z.number().int().min(15).max(10_080),
    goalId: goalIdV1Schema.nullable(),
    maxBlockMinutes: z.number().int().min(15).max(480),
    maxDeepWorkMinutesPerDay: z.number().int().min(15).max(960),
    minBlockMinutes: z.number().int().min(15).max(480),
    ownerConfirmed: z.literal(true),
    taskId: taskIdV1Schema.nullable(),
    timeZone: timeZoneV1Schema,
    title: z.string().trim().min(1).max(240),
    workingWindows: z.array(schedulingIntervalV1Schema).min(1).max(31),
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.deadline) <= Date.parse(input.earliestStart))
      context.addIssue({
        code: 'custom',
        message: 'The deadline must follow the earliest start.',
        path: ['deadline'],
      });
    if (input.minBlockMinutes > input.maxBlockMinutes)
      context.addIssue({
        code: 'custom',
        message: 'Minimum block size cannot exceed maximum block size.',
        path: ['minBlockMinutes'],
      });
    if (input.taskId === null && input.goalId === null)
      context.addIssue({
        code: 'custom',
        message: 'A scheduling proposal must link a task or goal.',
        path: ['taskId'],
      });
    for (const [index, window] of input.workingWindows.entries()) {
      if (
        Date.parse(window.startsAt) < Date.parse(input.earliestStart) ||
        Date.parse(window.endsAt) > Date.parse(input.deadline)
      )
        context.addIssue({
          code: 'custom',
          message: 'Working windows must stay inside the planning horizon.',
          path: ['workingWindows', index],
        });
    }
  });

export const acceptSchedulingProposalInputV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export const dismissSchedulingProposalInputV1Schema =
  acceptSchedulingProposalInputV1Schema;

export const schedulingEventTypeV1Schema = z.enum([
  'scheduling.proposal_created.v1',
  'scheduling.proposal_accepted.v1',
  'scheduling.proposal_dismissed.v1',
  'scheduling.proposal_staled.v1',
]);
export type SchedulingEventType = z.infer<typeof schedulingEventTypeV1Schema>;

export const schedulingEventPayloadV1Schema = z
  .object({
    blockCount: z.number().int().nonnegative(),
    proposalId: schedulingProposalIdV1Schema,
    state: schedulingProposalStateV1Schema,
    verdict: schedulingVerdictV1Schema,
  })
  .strict();

export { calendarBlockIdV1Schema, schedulingProposalIdV1Schema };
