import { describe, expect, it } from 'vitest';
import {
  activeGoalGuidanceV1,
  createEdgeInputV1Schema,
  goalTargetDateV1Schema,
  transitionGoalInputV1Schema,
  transitionGoalStateV1,
  updateGoalLimitInputV1Schema,
} from '../../packages/domain/src/index.js';

describe('WP-14 goal and load invariants', () => {
  it('keeps the active-goal threshold advisory and transparent', () => {
    expect(activeGoalGuidanceV1(4, 5)).toEqual({
      activeCount: 4,
      limit: 5,
      overBy: 0,
      requiresAcknowledgement: false,
      status: 'within_limit',
    });
    expect(activeGoalGuidanceV1(5, 5)).toMatchObject({
      requiresAcknowledgement: true,
      status: 'at_limit',
    });
    expect(activeGoalGuidanceV1(7, 5)).toMatchObject({
      overBy: 2,
      status: 'over_limit',
    });
  });

  it('accepts only the specified lifecycle transitions', () => {
    expect(transitionGoalStateV1('incubating', 'active')).toBe('active');
    expect(transitionGoalStateV1('active', 'paused')).toBe('paused');
    expect(transitionGoalStateV1('paused', 'active')).toBe('active');
    expect(() => transitionGoalStateV1('completed', 'active')).toThrow(
      'Goal state transition is invalid.',
    );
    expect(() => transitionGoalStateV1('incubating', 'completed')).toThrow(
      'Goal state transition is invalid.',
    );
  });

  it('requires a distinct merge target only for a merged transition', () => {
    const common = {
      acknowledgeActiveLimit: false,
      expectedVersion: 1,
      ownerConfirmed: true,
    } as const;
    expect(
      transitionGoalInputV1Schema.safeParse({
        ...common,
        mergedIntoGoalId: null,
        nextState: 'active',
      }).success,
    ).toBe(true);
    expect(
      transitionGoalInputV1Schema.safeParse({
        ...common,
        mergedIntoGoalId: null,
        nextState: 'merged',
      }).success,
    ).toBe(false);
  });

  it('rejects impossible dates, self-edges, and unsafe load settings', () => {
    expect(goalTargetDateV1Schema.safeParse('2026-02-29').success).toBe(false);
    expect(goalTargetDateV1Schema.safeParse('2028-02-29').success).toBe(true);
    const id = '018f0f77-34f1-7ef2-8ca1-7a3bf7f01970';
    expect(
      createEdgeInputV1Schema.safeParse({
        edgeType: 'depends_on',
        ownerConfirmed: true,
        sourceResourceId: id,
        targetResourceId: id,
      }).success,
    ).toBe(false);
    expect(
      updateGoalLimitInputV1Schema.safeParse({
        ownerConfirmed: true,
        softActiveGoalLimit: 21,
      }).success,
    ).toBe(false);
  });
});
