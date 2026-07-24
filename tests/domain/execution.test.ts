import { describe, expect, it } from 'vitest';
import {
  confidenceClassForEvidenceV1,
  postBlockConfirmationInputV1Schema,
  weeklyReviewQueryV1Schema,
} from '../../packages/domain/src/index.js';

describe('execution evidence policy', () => {
  it('maps every evidence type to a deterministic confidence class', () => {
    expect(confidenceClassForEvidenceV1('user_completed_task')).toBe(
      'owner_confirmed',
    );
    expect(confidenceClassForEvidenceV1('post_block_confirmed')).toBe(
      'owner_confirmed',
    );
    expect(confidenceClassForEvidenceV1('focus_session_recorded')).toBe(
      'locally_observed',
    );
    expect(confidenceClassForEvidenceV1('external_task_completed')).toBe(
      'externally_confirmed',
    );
    expect(confidenceClassForEvidenceV1('calendar_elapsed_unknown')).toBe(
      'unknown',
    );
    expect(confidenceClassForEvidenceV1('user_reported_not_done')).toBe(
      'owner_confirmed',
    );
  });

  it('requires literal owner confirmation and exact partial duration semantics', () => {
    expect(() =>
      postBlockConfirmationInputV1Schema.parse({
        expectedBlockVersion: 1,
        ownerConfirmed: false,
        reportedDurationMinutes: null,
        response: 'done',
      }),
    ).toThrow();
    expect(() =>
      postBlockConfirmationInputV1Schema.parse({
        expectedBlockVersion: 1,
        ownerConfirmed: true,
        reportedDurationMinutes: null,
        response: 'partly_done',
      }),
    ).toThrow();
    expect(
      postBlockConfirmationInputV1Schema.parse({
        expectedBlockVersion: 1,
        ownerConfirmed: true,
        reportedDurationMinutes: 25,
        response: 'partly_done',
      }),
    ).toMatchObject({ reportedDurationMinutes: 25 });
  });

  it('requires an exact local week start and valid IANA time zone', () => {
    expect(
      weeklyReviewQueryV1Schema.parse({
        timeZone: 'Africa/Johannesburg',
        weekStartsOn: '2026-07-20',
      }),
    ).toEqual({
      timeZone: 'Africa/Johannesburg',
      weekStartsOn: '2026-07-20',
    });
    expect(() =>
      weeklyReviewQueryV1Schema.parse({
        timeZone: 'not-a-zone',
        weekStartsOn: '2026-07-20',
      }),
    ).toThrow();
  });
});
