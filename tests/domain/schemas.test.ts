import { describe, expect, it } from 'vitest';
import {
  authIdentifierV1Schema,
  authPassphraseV1Schema,
  authorityTierV1Schema,
  domainEventEnvelopeV1Schema,
  journalBodyMarkdownV1Schema,
  journalRevisionEventPayloadV1Schema,
  processingClassV1Schema,
  recoveryCodeV1Schema,
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

  it('normalizes local authentication identifiers and recovery codes', () => {
    expect(authIdentifierV1Schema.parse('  Owner.Name  ')).toBe('owner.name');
    expect(recoveryCodeV1Schema.parse('  mrd-abcdefgh-23456789  ')).toBe(
      'MRD-ABCDEFGH-23456789',
    );
  });

  it('rejects weak passphrases and malformed authentication identifiers', () => {
    expect(authPassphraseV1Schema.safeParse('too short').success).toBe(false);
    expect(authIdentifierV1Schema.safeParse('owner@example.com').success).toBe(
      false,
    );
  });

  it('validates journal bodies and content-free revision event payloads', () => {
    expect(journalBodyMarkdownV1Schema.safeParse('   ').success).toBe(false);
    expect(
      journalRevisionEventPayloadV1Schema.parse({
        changeKind: 'privacy',
        entryId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01980',
        processingClass: 'private',
        revisionId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
        revisionNumber: 2,
      }),
    ).toMatchObject({ revisionNumber: 2, processingClass: 'private' });
    expect(() =>
      journalRevisionEventPayloadV1Schema.parse({
        bodyMarkdown: 'must never enter the event payload',
        changeKind: 'content',
        entryId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01980',
        processingClass: 'standard',
        revisionId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
        revisionNumber: 1,
      }),
    ).toThrow();
  });
});
