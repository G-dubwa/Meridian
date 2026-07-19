import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  InvalidAuthorityError,
  entryRevisionIdV1Schema,
  interpretationOutputV1Schema,
  routeInterpretationAuthorityV1,
  transitionProposalStatusV1,
  validateInterpretationOutputV1,
} from '../../packages/domain/src/index.js';

const revisionId = entryRevisionIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
);

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    assertionClass: 'strong_interpretation',
    authorityClass: 'inferred_structure',
    confidence: 0.95,
    dedupeKey: 'a'.repeat(64),
    payload: { kind: 'task', schemaVersion: 1, title: 'Review notes' },
    sourceRevisionId: revisionId,
    sourceSpanEnd: 12,
    sourceSpanStart: 0,
    uncertaintyIndicators: [],
    ...overrides,
  };
}

describe('interpretation authority routing', () => {
  it('routes only explicit deterministic internal commands to T1', () => {
    expect(
      routeInterpretationAuthorityV1({
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        prohibited: false,
      }),
    ).toEqual({ authorityTier: 'T1', route: 'direct_command' });
  });

  it('routes ambiguity to clarification before considering explicitness', () => {
    expect(
      routeInterpretationAuthorityV1({
        ambiguous: true,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        prohibited: false,
      }),
    ).toEqual({ authorityTier: 'T0', route: 'clarification' });
  });

  it('keeps inference in Triage and external effects behind exact preview', () => {
    expect(
      routeInterpretationAuthorityV1({
        ambiguous: false,
        deterministic: false,
        explicit: false,
        externalEffect: false,
        prohibited: false,
      }).route,
    ).toBe('triage');
    expect(
      routeInterpretationAuthorityV1({
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: true,
        prohibited: false,
      }).route,
    ).toBe('external_preview');
  });
});

describe('proposal validation and lifecycle', () => {
  it('accepts at most seven source-bound, deduplicated proposals', () => {
    const output = interpretationOutputV1Schema.parse({
      clarificationQuestion: null,
      outcome: 'proposals',
      proposals: [candidate()],
      schemaVersion: 1,
      uncertaintyIndicators: [],
    });
    expect(
      validateInterpretationOutputV1(output, {
        bodyLength: 12,
        revisionId,
      }),
    ).toEqual(output);
  });

  it('rejects spans outside the authoritative source and duplicate keys', () => {
    const outside = interpretationOutputV1Schema.parse({
      clarificationQuestion: null,
      outcome: 'proposals',
      proposals: [candidate({ sourceSpanEnd: 13 })],
      schemaVersion: 1,
      uncertaintyIndicators: [],
    });
    expect(() =>
      validateInterpretationOutputV1(outside, {
        bodyLength: 12,
        revisionId,
      }),
    ).toThrow(DomainValidationError);

    const duplicates = interpretationOutputV1Schema.parse({
      clarificationQuestion: null,
      outcome: 'proposals',
      proposals: [candidate(), candidate()],
      schemaVersion: 1,
      uncertaintyIndicators: [],
    });
    expect(() =>
      validateInterpretationOutputV1(duplicates, {
        bodyLength: 12,
        revisionId,
      }),
    ).toThrow(DomainValidationError);
  });

  it('never accepts a hypothesis as durable structure', () => {
    expect(() =>
      transitionProposalStatusV1('pending', 'accept', 'hypothesis'),
    ).toThrow(InvalidAuthorityError);
    expect(transitionProposalStatusV1('pending', 'dismiss', 'hypothesis')).toBe(
      'dismissed',
    );
  });
});
