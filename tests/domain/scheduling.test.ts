import { describe, expect, it } from 'vitest';
import { proposeBlocks } from '../../packages/scheduling/src/index.js';
import { createSchedulingProposalInputV1Schema } from '../../packages/domain/src/index.js';

describe('WP-15 deterministic local scheduling', () => {
  it('never overlaps buffered local busy time and splits exact effort', () => {
    const result = proposeBlocks({
      availability: [
        {
          endsAt: new Date('2026-07-24T15:00:00.000Z'),
          startsAt: new Date('2026-07-24T06:00:00.000Z'),
        },
      ],
      bufferMinutes: 15,
      busy: [
        {
          endsAt: new Date('2026-07-24T09:00:00.000Z'),
          startsAt: new Date('2026-07-24T08:00:00.000Z'),
        },
      ],
      estimatedEffortMinutes: 180,
      maxBlockMinutes: 90,
      maxDeepWorkMinutesPerDay: 240,
      minBlockMinutes: 30,
      timeZone: 'Africa/Johannesburg',
    });
    expect(result.verdict).toBe('feasible');
    expect(result.scheduledMinutes).toBe(180);
    expect(result.candidates).toHaveLength(2);
    expect(
      result.candidates.every(
        (candidate) =>
          Date.parse(candidate.endsAt) <=
            Date.parse('2026-07-24T07:45:00.000Z') ||
          Date.parse(candidate.startsAt) >=
            Date.parse('2026-07-24T09:15:00.000Z'),
      ),
    ).toBe(true);
  });

  it('fails transparently when daily load or capacity is insufficient', () => {
    const result = proposeBlocks({
      availability: [
        {
          endsAt: new Date('2026-07-24T10:00:00.000Z'),
          startsAt: new Date('2026-07-24T08:00:00.000Z'),
        },
      ],
      bufferMinutes: 0,
      busy: [],
      estimatedEffortMinutes: 180,
      maxBlockMinutes: 60,
      maxDeepWorkMinutesPerDay: 120,
      minBlockMinutes: 30,
      timeZone: 'Africa/Johannesburg',
    });
    expect(result).toMatchObject({
      capacityMinutes: 120,
      scheduledMinutes: 120,
      verdict: 'infeasible',
    });
    expect(result.alternatives).toContain(
      'Move the deadline or add a working window.',
    );
  });

  it('avoids a sub-minimum greedy remainder when an exact split is feasible', () => {
    const result = proposeBlocks({
      availability: [
        {
          endsAt: new Date('2026-07-24T10:00:00.000Z'),
          startsAt: new Date('2026-07-24T08:00:00.000Z'),
        },
      ],
      bufferMinutes: 0,
      busy: [],
      estimatedEffortMinutes: 80,
      maxBlockMinutes: 60,
      maxDeepWorkMinutesPerDay: 120,
      minBlockMinutes: 30,
      timeZone: 'Africa/Johannesburg',
    });
    expect(result.candidates.map((item) => item.minutes)).toEqual([50, 30]);
    expect(result.scheduledMinutes).toBe(80);
  });

  it('requires exact owner-confirmed, bounded local inputs', () => {
    const id = '018f0f77-34f1-7ef2-8ca1-7a3bf7f01970';
    const base = {
      bufferMinutes: 15,
      deadline: '2026-07-24T15:00:00.000+02:00',
      earliestStart: '2026-07-24T08:00:00.000+02:00',
      estimatedEffortMinutes: 120,
      goalId: null,
      maxBlockMinutes: 90,
      maxDeepWorkMinutesPerDay: 240,
      minBlockMinutes: 30,
      ownerConfirmed: true,
      taskId: id,
      timeZone: 'Africa/Johannesburg',
      title: 'Synthetic plan',
      workingWindows: [
        {
          endsAt: '2026-07-24T15:00:00.000+02:00',
          startsAt: '2026-07-24T08:00:00.000+02:00',
        },
      ],
    } as const;
    expect(createSchedulingProposalInputV1Schema.safeParse(base).success).toBe(
      true,
    );
    expect(
      createSchedulingProposalInputV1Schema.safeParse({
        ...base,
        ownerConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      createSchedulingProposalInputV1Schema.safeParse({
        ...base,
        workingWindows: [
          {
            endsAt: '2026-07-24T17:00:00.000+02:00',
            startsAt: '2026-07-24T08:00:00.000+02:00',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
