import { describe, expect, it } from 'vitest';
import {
  assertDirectCommandAuthorityV1,
  createReminderInputV1Schema,
  recurrenceRuleV1Schema,
  resolveExplicitReminderCommandV1,
  transitionReminderStateV1,
  transitionTaskStateV1,
} from '../../packages/domain/src/index.js';

describe('WP-10 task and reminder domain', () => {
  it('resolves the bounded reminder grammar without an LLM', () => {
    expect(
      resolveExplicitReminderCommandV1({
        command: 'Remind me tomorrow at 15:00 to email Margaret.',
        now: new Date('2026-07-18T20:00:00.000Z'),
        timeZone: 'Africa/Johannesburg',
      }),
    ).toEqual({
      purpose: 'email Margaret',
      timeZone: 'Africa/Johannesburg',
      triggerAt: '2026-07-19T13:00:00.000Z',
    });
  });

  it('rejects natural-language ambiguity and DST gaps or overlaps', () => {
    expect(() =>
      resolveExplicitReminderCommandV1({
        command: 'Remind me sometime tomorrow to send the update',
        now: new Date('2026-07-18T08:00:00.000Z'),
        timeZone: 'Africa/Johannesburg',
      }),
    ).toThrow(/Use/);
    expect(() =>
      resolveExplicitReminderCommandV1({
        command: 'Remind me 2026-03-08 at 02:30 to check the clock',
        now: new Date('2026-01-01T00:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toThrow(/does not exist/);
    expect(() =>
      resolveExplicitReminderCommandV1({
        command: 'Remind me 2026-11-01 at 01:30 to check the clock',
        now: new Date('2026-01-01T00:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toThrow(/ambiguous/);
  });

  it('requires explicit deterministic internal owner authority', () => {
    expect(() => {
      assertDirectCommandAuthorityV1({
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
      });
    }).not.toThrow();
    expect(() => {
      assertDirectCommandAuthorityV1({
        ambiguous: true,
        deterministic: false,
        explicit: false,
        externalEffect: true,
      });
    }).toThrow(/explicit, deterministic/);
  });

  it('validates recurrence and reminder expiry fail closed', () => {
    expect(
      recurrenceRuleV1Schema.parse({
        frequency: 'weekly',
        interval: 2,
        schemaVersion: 1,
        until: null,
        weekDays: [1, 5],
      }),
    ).toMatchObject({ frequency: 'weekly' });
    expect(() =>
      recurrenceRuleV1Schema.parse({
        frequency: 'daily',
        interval: 1,
        schemaVersion: 1,
        until: null,
        weekDays: [1],
      }),
    ).toThrow();
    expect(() =>
      createReminderInputV1Schema.parse({
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        expiresAt: '2026-07-19T11:00:00.000Z',
        priority: 'normal',
        purpose: 'Test reminder',
        recurrence: null,
        relatedResourceId: null,
        timeZone: 'Africa/Johannesburg',
        triggerAt: '2026-07-19T12:00:00.000Z',
      }),
    ).toThrow(/expiry/);
  });

  it('permits only documented lifecycle transitions', () => {
    expect(transitionTaskStateV1('open', 'done')).toBe('done');
    expect(() => transitionTaskStateV1('done', 'open')).toThrow();
    expect(transitionReminderStateV1('scheduled', 'due')).toBe('due');
    expect(transitionReminderStateV1('due', 'snoozed')).toBe('snoozed');
    expect(transitionReminderStateV1('snoozed', 'scheduled')).toBe('scheduled');
    expect(() => transitionReminderStateV1('completed', 'scheduled')).toThrow();
  });
});
