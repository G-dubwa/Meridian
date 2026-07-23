import { z } from 'zod';
import { DomainValidationError } from './errors.js';
import { edgeIdV1Schema, goalIdV1Schema, resourceIdV1Schema } from './ids.js';

export const goalTypeV1Schema = z.enum(['outcome', 'behavioural']);
export type GoalType = z.infer<typeof goalTypeV1Schema>;

export const goalStateV1Schema = z.enum([
  'incubating',
  'active',
  'paused',
  'completed',
  'retired',
  'merged',
]);
export type GoalState = z.infer<typeof goalStateV1Schema>;

export const edgeTypeV1Schema = z.enum([
  'part_of',
  'depends_on',
  'blocks',
  'conflicts_with',
  'supports',
  'merged_into',
]);
export type EdgeType = z.infer<typeof edgeTypeV1Schema>;

export const goalTitleV1Schema = z.string().trim().min(1).max(240);
export const goalNarrativeV1Schema = z.string().trim().max(4_000);
export const goalSuccessCriteriaV1Schema = z.string().trim().max(2_000);
export const lifeDomainV1Schema = z.string().trim().min(1).max(100);
export const goalTargetDateV1Schema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Goal target date is invalid.');

export const ownerConfirmedV1Schema = z.literal(true);

export const createGoalInputV1Schema = z
  .object({
    lifeDomain: lifeDomainV1Schema,
    narrative: goalNarrativeV1Schema,
    ownerConfirmed: ownerConfirmedV1Schema,
    successCriteria: goalSuccessCriteriaV1Schema,
    targetDate: goalTargetDateV1Schema.nullable(),
    title: goalTitleV1Schema,
    type: goalTypeV1Schema,
  })
  .strict();

export const updateGoalInputV1Schema = createGoalInputV1Schema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();

export const transitionGoalInputV1Schema = z
  .object({
    acknowledgeActiveLimit: z.boolean(),
    expectedVersion: z.number().int().positive(),
    mergedIntoGoalId: goalIdV1Schema.nullable(),
    nextState: goalStateV1Schema,
    ownerConfirmed: ownerConfirmedV1Schema,
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.nextState === 'merged') !== (input.mergedIntoGoalId !== null))
      context.addIssue({
        code: 'custom',
        message: 'A merged goal requires exactly one merge target.',
        path: ['mergedIntoGoalId'],
      });
  });

export const createEdgeInputV1Schema = z
  .object({
    edgeType: edgeTypeV1Schema,
    ownerConfirmed: ownerConfirmedV1Schema,
    sourceResourceId: resourceIdV1Schema,
    targetResourceId: resourceIdV1Schema,
  })
  .strict()
  .refine((input) => input.sourceResourceId !== input.targetResourceId, {
    message: 'An edge cannot connect a resource to itself.',
    path: ['targetResourceId'],
  });

export const removeEdgeInputV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: ownerConfirmedV1Schema,
  })
  .strict();

export const updateGoalLimitInputV1Schema = z
  .object({
    ownerConfirmed: ownerConfirmedV1Schema,
    softActiveGoalLimit: z.number().int().min(1).max(20),
  })
  .strict();

export function transitionGoalStateV1(
  current: GoalState,
  next: GoalState,
): GoalState {
  const allowed: Readonly<Record<GoalState, readonly GoalState[]>> = {
    active: ['paused', 'completed', 'retired', 'merged'],
    completed: [],
    incubating: ['active', 'retired'],
    merged: [],
    paused: ['active', 'retired'],
    retired: [],
  };
  if (!allowed[current].includes(next))
    throw new DomainValidationError('Goal state transition is invalid.');
  return next;
}

export interface ActiveGoalGuidance {
  readonly activeCount: number;
  readonly limit: number;
  readonly overBy: number;
  readonly requiresAcknowledgement: boolean;
  readonly status: 'within_limit' | 'at_limit' | 'over_limit';
}

export function activeGoalGuidanceV1(
  activeCount: number,
  limit: number,
): ActiveGoalGuidance {
  if (!Number.isInteger(activeCount) || activeCount < 0)
    throw new DomainValidationError('Active-goal count is invalid.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new DomainValidationError('Active-goal limit is invalid.');
  const overBy = Math.max(0, activeCount - limit);
  return {
    activeCount,
    limit,
    overBy,
    requiresAcknowledgement: activeCount >= limit,
    status:
      activeCount > limit
        ? 'over_limit'
        : activeCount === limit
          ? 'at_limit'
          : 'within_limit',
  };
}

export const goalEventTypeV1Schema = z.enum([
  'goal.created.v1',
  'goal.updated.v1',
  'goal.transitioned.v1',
  'goal.edge_created.v1',
  'goal.edge_removed.v1',
  'goal.load_limit_updated.v1',
]);
export type GoalEventType = z.infer<typeof goalEventTypeV1Schema>;

export const goalEventPayloadV1Schema = z
  .object({
    action: z.enum([
      'created',
      'updated',
      'transitioned',
      'edge_created',
      'edge_removed',
      'load_limit_updated',
    ]),
    activeLimit: z.number().int().min(1).max(20).nullable(),
    edgeId: edgeIdV1Schema.nullable(),
    edgeType: edgeTypeV1Schema.nullable(),
    goalState: goalStateV1Schema.nullable(),
    sourceResourceId: resourceIdV1Schema.nullable(),
    targetResourceId: resourceIdV1Schema.nullable(),
  })
  .strict();
