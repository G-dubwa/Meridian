import { z } from 'zod';
import { ProcessingClassViolationError } from './errors.js';

export const processingClassV1Schema = z.enum([
  'standard',
  'sensitive',
  'private',
]);
export type ProcessingClass = z.infer<typeof processingClassV1Schema>;

export const processingRouteV1Schema = z.enum([
  'local_display',
  'external_llm',
  'external_embedding',
  'proactive_surface',
]);
export type ProcessingRoute = z.infer<typeof processingRouteV1Schema>;

export interface ProcessingConsentV1 {
  readonly standardProactiveEvidenceEligible: boolean;
  readonly sensitiveExternalLlm: boolean;
  readonly sensitiveExternalEmbedding: boolean;
  readonly sensitiveProactiveSurfacing: boolean;
}

const privacyRank = { standard: 0, sensitive: 1, private: 2 } as const;

export function raiseProcessingClassV1(
  selected: ProcessingClass,
  suggested: ProcessingClass,
): ProcessingClass {
  return privacyRank[suggested] > privacyRank[selected] ? suggested : selected;
}

export function isProcessingRouteAllowedV1(
  processingClass: ProcessingClass,
  route: ProcessingRoute,
  consent: ProcessingConsentV1,
): boolean {
  if (route === 'local_display') return true;
  if (processingClass === 'private') return false;
  if (processingClass === 'standard') {
    return route === 'proactive_surface'
      ? consent.standardProactiveEvidenceEligible
      : true;
  }
  if (route === 'external_llm') return consent.sensitiveExternalLlm;
  if (route === 'external_embedding') return consent.sensitiveExternalEmbedding;
  return consent.sensitiveProactiveSurfacing;
}

export function assertProcessingRouteAllowedV1(
  processingClass: ProcessingClass,
  route: ProcessingRoute,
  consent: ProcessingConsentV1,
): void {
  if (!isProcessingRouteAllowedV1(processingClass, route, consent)) {
    throw new ProcessingClassViolationError(
      'The processing route is not permitted.',
      {
        processingClass,
        route,
      },
    );
  }
}
