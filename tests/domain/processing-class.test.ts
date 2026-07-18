import { describe, expect, it } from 'vitest';
import {
  assertProcessingRouteAllowedV1,
  isProcessingRouteAllowedV1,
  ProcessingClassViolationError,
  raiseProcessingClassV1,
} from '../../packages/domain/src/index.js';

const noSensitiveConsent = {
  standardProactiveEvidenceEligible: false,
  sensitiveExternalEmbedding: false,
  sensitiveExternalLlm: false,
  sensitiveProactiveSurfacing: false,
} as const;

describe('processing class policy v1', () => {
  it('never permits a private resource to leave local display', () => {
    for (const route of [
      'external_llm',
      'external_embedding',
      'proactive_surface',
    ] as const) {
      expect(
        isProcessingRouteAllowedV1('private', route, noSensitiveConsent),
      ).toBe(false);
    }
  });

  it('requires explicit sensitive-route consent', () => {
    expect(() => {
      assertProcessingRouteAllowedV1(
        'sensitive',
        'external_llm',
        noSensitiveConsent,
      );
    }).toThrow(ProcessingClassViolationError);
    expect(
      isProcessingRouteAllowedV1('sensitive', 'external_llm', {
        ...noSensitiveConsent,
        sensitiveExternalLlm: true,
      }),
    ).toBe(true);
  });

  it('can raise but never lower a selected class', () => {
    expect(raiseProcessingClassV1('standard', 'private')).toBe('private');
    expect(raiseProcessingClassV1('private', 'standard')).toBe('private');
    expect(raiseProcessingClassV1('sensitive', 'standard')).toBe('sensitive');
  });

  it('requires evidence eligibility before proactively surfacing Standard content', () => {
    expect(
      isProcessingRouteAllowedV1(
        'standard',
        'proactive_surface',
        noSensitiveConsent,
      ),
    ).toBe(false);
    expect(
      isProcessingRouteAllowedV1('standard', 'proactive_surface', {
        ...noSensitiveConsent,
        standardProactiveEvidenceEligible: true,
      }),
    ).toBe(true);
  });
});
