import { describe, expect, it } from 'vitest';
import {
  initialModelRouteV1,
  nextModelRouteV1,
} from '../../packages/application/src/index.js';

describe('provisional Alpha GPT-5.6 routing policy', () => {
  it('keeps deterministic operations outside the model gateway', () => {
    expect(initialModelRouteV1('deterministic_operation')).toEqual({
      active: true,
      confidenceThreshold: null,
      modelId: null,
      outputAuthority: 'deterministic_operation',
      ownerConfirmationRequired: false,
      reasoningEffort: null,
      route: 'deterministic',
      taskClass: 'deterministic_operation',
    });
  });

  it('activates only owner-confirmed bounded outputs at the approved tiers', () => {
    expect(initialModelRouteV1('bounded_extraction')).toMatchObject({
      active: true,
      modelId: 'gpt-5.6-sol',
      outputAuthority: 'triage_proposal_only',
      ownerConfirmationRequired: true,
      reasoningEffort: 'none',
      route: 'sol',
    });
    expect(initialModelRouteV1('bounded_classification')).toMatchObject({
      active: true,
      modelId: 'gpt-5.6-terra',
      outputAuthority: 'classification_or_triage_proposal',
      ownerConfirmationRequired: true,
      reasoningEffort: 'none',
      route: 'terra',
    });
  });

  it('routes ambiguity to clarification without an automatic model call', () => {
    expect(initialModelRouteV1('ambiguous_interpretation')).toMatchObject({
      active: false,
      modelId: null,
      outputAuthority: 'clarification_or_no_action',
      route: 'clarification',
    });
  });

  it.each([
    'weekly_review',
    'knowledge_extraction',
    'contextual_reasoning',
    'complex_planning',
    'difficult_synthesis',
    'safety_sensitive_review',
  ] as const)('keeps %s inactive', (taskClass) => {
    expect(initialModelRouteV1(taskClass)).toMatchObject({
      active: false,
      modelId: null,
      outputAuthority: 'inactive',
      reasoningEffort: null,
      route: 'inactive',
    });
  });

  it('requires deterministic validation, provenance, and no explicit uncertainty in addition to confidence', () => {
    const base = {
      abstained: false,
      confidence: 0.99,
      deterministicValidationPassed: true,
      explicitUncertainty: false,
      provenanceComplete: true,
      route: 'sol',
      schemaValid: true,
      taskClass: 'bounded_extraction',
    } as const;
    expect(nextModelRouteV1(base).route).toBe('sol');
    for (const failed of [
      { ...base, abstained: true },
      { ...base, confidence: 0.89 },
      { ...base, deterministicValidationPassed: false },
      { ...base, explicitUncertainty: true },
      { ...base, provenanceComplete: false },
      { ...base, schemaValid: false },
    ])
      expect(nextModelRouteV1(failed).route).toBe('manual_review');

    expect(
      nextModelRouteV1({
        ...base,
        route: 'terra',
        taskClass: 'bounded_classification',
      }),
    ).toMatchObject({
      outputAuthority: 'classification_or_triage_proposal',
      ownerConfirmationRequired: true,
      route: 'terra',
    });
  });

  it('fails closed without automatic tier escalation', () => {
    expect(
      nextModelRouteV1({
        abstained: false,
        confidence: 1,
        deterministicValidationPassed: true,
        explicitUncertainty: false,
        provenanceComplete: true,
        route: 'luna',
        schemaValid: true,
        taskClass: 'bounded_extraction',
      }).route,
    ).toBe('manual_review');
    expect(
      nextModelRouteV1({
        abstained: false,
        confidence: 1,
        deterministicValidationPassed: true,
        explicitUncertainty: false,
        provenanceComplete: true,
        route: 'sol',
        schemaValid: true,
        taskClass: 'safety_sensitive_review',
      }).route,
    ).toBe('manual_review');
  });
});
