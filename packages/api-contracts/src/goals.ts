import {
  createEdgeInputV1Schema,
  createGoalInputV1Schema,
  edgeIdV1Schema,
  edgeTypeV1Schema,
  goalIdV1Schema,
  goalStateV1Schema,
  goalTypeV1Schema,
  resourceIdV1Schema,
  transitionGoalInputV1Schema,
  updateGoalInputV1Schema,
  updateGoalLimitInputV1Schema,
} from '@meridian/domain';
import { z } from 'zod';
import { taskResponseV1Schema } from './actions.js';

const dateTime = z.iso.datetime({ offset: true });

export const goalResponseV1Schema = z
  .object({
    createdAt: dateTime,
    creationAuthority: z.enum(['manual', 'accepted_proposal']),
    id: goalIdV1Schema,
    lifeDomain: z.string(),
    narrative: z.string(),
    resourceId: resourceIdV1Schema,
    sourceProposalId: z.uuid().nullable(),
    state: goalStateV1Schema,
    successCriteria: z.string(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    title: z.string(),
    type: goalTypeV1Schema,
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const edgeResponseV1Schema = z
  .object({
    createdAt: dateTime,
    edgeType: edgeTypeV1Schema,
    id: edgeIdV1Schema,
    removedAt: dateTime.nullable(),
    sourceResourceId: resourceIdV1Schema,
    targetResourceId: resourceIdV1Schema,
    updatedAt: dateTime,
    version: z.number().int().positive(),
  })
  .strict();

export const activeGoalGuidanceResponseV1Schema = z
  .object({
    activeCount: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(20),
    overBy: z.number().int().nonnegative(),
    requiresAcknowledgement: z.boolean(),
    status: z.enum(['within_limit', 'at_limit', 'over_limit']),
  })
  .strict();

export const goalLimitResponseV1Schema = z
  .object({
    softActiveGoalLimit: z.number().int().min(1).max(20),
    updatedAt: dateTime,
  })
  .strict();

export const goalSnapshotResponseV1Schema = z
  .object({
    blockers: z.array(
      z
        .object({
          blockingResourceIds: z.array(resourceIdV1Schema),
          goalResourceId: resourceIdV1Schema,
        })
        .strict(),
    ),
    edges: z.array(edgeResponseV1Schema),
    goals: z.array(goalResponseV1Schema),
    guidance: activeGoalGuidanceResponseV1Schema,
    linkedTasks: z.array(taskResponseV1Schema),
  })
  .strict();

export const createGoalRequestV1Schema = createGoalInputV1Schema;
export const updateGoalRequestV1Schema = updateGoalInputV1Schema;
export const transitionGoalRequestV1Schema = transitionGoalInputV1Schema;
export const createEdgeRequestV1Schema = createEdgeInputV1Schema;
export const updateGoalLimitRequestV1Schema = updateGoalLimitInputV1Schema;

export const removeEdgeRequestV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export type GoalResponseV1 = z.infer<typeof goalResponseV1Schema>;
export type GoalSnapshotResponseV1 = z.infer<
  typeof goalSnapshotResponseV1Schema
>;
