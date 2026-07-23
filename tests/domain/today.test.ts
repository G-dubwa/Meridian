import {
  createAgendaBlockInputV1Schema,
  localDateBoundsV1,
  localDateV1Schema,
  reminderIdV1Schema,
  reminderOccurrenceIdV1Schema,
  selectDailyPriorityInputV1Schema,
  userIdV1Schema,
} from '../../packages/domain/src/index.js';
import type {
  CalendarPort,
  ReminderDeliveryPort,
  UserScope,
} from '../../packages/domain/src/index.js';
import { describe, expect, it } from 'vitest';

describe('Local Alpha Today domain', () => {
  it('resolves local-day bounds deterministically across DST', () => {
    const johannesburg = localDateBoundsV1('2026-07-23', 'Africa/Johannesburg');
    expect(johannesburg.start.toISOString()).toBe('2026-07-22T22:00:00.000Z');
    expect(johannesburg.end.toISOString()).toBe('2026-07-23T22:00:00.000Z');

    const newYorkSpring = localDateBoundsV1('2026-03-08', 'America/New_York');
    expect(newYorkSpring.end.getTime() - newYorkSpring.start.getTime()).toBe(
      23 * 60 * 60 * 1_000,
    );
  });

  it('rejects malformed calendar dates and agenda ranges', () => {
    expect(() => localDateV1Schema.parse('2026-02-30')).toThrow();
    expect(() =>
      createAgendaBlockInputV1Schema.parse({
        endsAt: '2026-07-23T08:00:00.000Z',
        notes: '',
        ownerConfirmed: true,
        startsAt: '2026-07-23T09:00:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Invalid range',
      }),
    ).toThrow();
  });

  it('constrains priority positions to the top three', () => {
    expect(() =>
      selectDailyPriorityInputV1Schema.parse({
        localDate: '2026-07-23',
        ownerConfirmed: true,
        position: 4,
        taskId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01970',
      }),
    ).toThrow();
  });

  it('keeps calendar and reminder delivery behind provider-neutral test adapters', async () => {
    const calls: string[] = [];
    const calendar: CalendarPort = {
      list: () => {
        calls.push('calendar');
        return Promise.resolve([]);
      },
    };
    const delivery: ReminderDeliveryPort = {
      deliver: () => {
        calls.push('delivery');
        return Promise.resolve({
          providerReference: null,
          state: 'rejected',
        });
      },
    };
    const scope = {
      userId: userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01970'),
    } satisfies UserScope;
    await expect(
      calendar.list(
        scope,
        new Date('2026-07-23T00:00:00Z'),
        new Date('2026-07-24T00:00:00Z'),
      ),
    ).resolves.toEqual([]);
    await expect(
      delivery.deliver(scope, {
        occurrenceId: reminderOccurrenceIdV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01971',
        ),
        reminderId: reminderIdV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01972',
        ),
        scheduledFor: new Date('2026-07-23T09:00:00Z'),
      }),
    ).resolves.toEqual({
      providerReference: null,
      state: 'rejected',
    });
    expect(calls).toEqual(['calendar', 'delivery']);
  });
});
