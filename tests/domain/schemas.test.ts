import { describe, expect, it } from 'vitest';
import {
  authorityTierV1Schema,
  domainEventEnvelopeV1Schema,
  processingClassV1Schema,
  userScopeV1Schema,
} from '../../packages/domain/src/index.js';

const userId = '018f0f77-34f1-7ef2-8ca1-7a3bf7f01970';
const eventId = '018f0f77-34f1-7ef2-8ca1-7a3bf7f01971';
const correlationId = '018f0f77-34f1-7ef2-8ca1-7a3bf7f01972';

describe('public domain schemas v1', () => {
  it('parses the versioned primitives', () => {
    expect(authorityTierV1Schema.parse('T3')).toBe('T3');
    expect(processingClassV1Schema.parse('private')).toBe('private');
    expect(userScopeV1Schema.parse({ userId })).toEqual({ userId });
  });

  it('parses an offset-aware v1 event envelope', () => {
    expect(
      domainEventEnvelopeV1Schema.parse({
        schemaVersion: 1,
        eventId,
        eventType: 'foundation.example.v1',
        occurredAt: '2026-07-18T10:00:00+02:00',
        scope: { userId },
        correlationId,
        payload: { example: true },
      }),
    ).toMatchObject({ schemaVersion: 1, eventType: 'foundation.example.v1' });
  });

  it('rejects unversioned or unknown event fields', () => {
    expect(() => {
      domainEventEnvelopeV1Schema.parse({
        schemaVersion: 2,
        eventId,
        eventType: 'foundation.example.v2',
        occurredAt: '2026-07-18T08:00:00Z',
        scope: { userId },
        correlationId,
        payload: {},
        unexpected: true,
      });
    }).toThrow();
  });
});
