import type { ModelReasoningEffort, ModelTaskClass } from '@meridian/domain';

export type Gpt56Tier = 'luna' | 'terra' | 'sol';
export type ModelRoute =
  Gpt56Tier | 'clarification' | 'deterministic' | 'inactive' | 'manual_review';
export type AlphaOutputAuthority =
  | 'classification_or_triage_proposal'
  | 'clarification_or_no_action'
  | 'deterministic_operation'
  | 'inactive'
  | 'triage_proposal_only';

export interface ModelRoutingDecisionV1 {
  readonly active: boolean;
  readonly confidenceThreshold: number | null;
  readonly modelId: string | null;
  readonly outputAuthority: AlphaOutputAuthority;
  readonly ownerConfirmationRequired: boolean;
  readonly reasoningEffort: ModelReasoningEffort | null;
  readonly route: ModelRoute;
  readonly taskClass: ModelTaskClass;
}

export interface ModelRouteOutcomeV1 {
  readonly abstained: boolean;
  readonly confidence: number;
  readonly deterministicValidationPassed: boolean;
  readonly explicitUncertainty: boolean;
  readonly provenanceComplete: boolean;
  readonly route: Gpt56Tier;
  readonly schemaValid: boolean;
  readonly taskClass: Exclude<ModelTaskClass, 'deterministic_operation'>;
}

const ACTIVE_ALPHA_MODEL_ROUTES = {
  bounded_classification: {
    active: true,
    confidenceThreshold: 0.9,
    modelId: 'gpt-5.6-terra',
    outputAuthority: 'classification_or_triage_proposal',
    ownerConfirmationRequired: true,
    reasoningEffort: 'none',
    route: 'terra',
    taskClass: 'bounded_classification',
  },
  bounded_extraction: {
    active: true,
    confidenceThreshold: 0.9,
    modelId: 'gpt-5.6-sol',
    outputAuthority: 'triage_proposal_only',
    ownerConfirmationRequired: true,
    reasoningEffort: 'none',
    route: 'sol',
    taskClass: 'bounded_extraction',
  },
} as const satisfies Partial<Record<ModelTaskClass, ModelRoutingDecisionV1>>;

function inactiveDecision(
  taskClass: Exclude<ModelTaskClass, 'deterministic_operation'>,
): ModelRoutingDecisionV1 {
  if (taskClass === 'ambiguous_interpretation')
    return {
      active: false,
      confidenceThreshold: null,
      modelId: null,
      outputAuthority: 'clarification_or_no_action',
      ownerConfirmationRequired: true,
      reasoningEffort: null,
      route: 'clarification',
      taskClass,
    };
  return {
    active: false,
    confidenceThreshold: null,
    modelId: null,
    outputAuthority: 'inactive',
    ownerConfirmationRequired: true,
    reasoningEffort: null,
    route: 'inactive',
    taskClass,
  };
}

function manualReviewDecision(
  taskClass: Exclude<ModelTaskClass, 'deterministic_operation'>,
): ModelRoutingDecisionV1 {
  return {
    active: false,
    confidenceThreshold: null,
    modelId: null,
    outputAuthority:
      taskClass === 'ambiguous_interpretation'
        ? 'clarification_or_no_action'
        : 'inactive',
    ownerConfirmationRequired: true,
    reasoningEffort: null,
    route: 'manual_review',
    taskClass,
  };
}

export function initialModelRouteV1(
  taskClass: ModelTaskClass,
): ModelRoutingDecisionV1 {
  if (taskClass === 'deterministic_operation')
    return {
      active: true,
      confidenceThreshold: null,
      modelId: null,
      outputAuthority: 'deterministic_operation',
      ownerConfirmationRequired: false,
      reasoningEffort: null,
      route: 'deterministic',
      taskClass,
    };
  if (taskClass === 'bounded_extraction')
    return ACTIVE_ALPHA_MODEL_ROUTES.bounded_extraction;
  if (taskClass === 'bounded_classification')
    return ACTIVE_ALPHA_MODEL_ROUTES.bounded_classification;
  return inactiveDecision(taskClass);
}

export function nextModelRouteV1(
  outcome: ModelRouteOutcomeV1,
): ModelRoutingDecisionV1 {
  const approved = initialModelRouteV1(outcome.taskClass);
  const accepted =
    approved.active &&
    approved.route === outcome.route &&
    approved.confidenceThreshold !== null &&
    outcome.schemaValid &&
    outcome.deterministicValidationPassed &&
    outcome.provenanceComplete &&
    !outcome.explicitUncertainty &&
    !outcome.abstained &&
    outcome.confidence >= approved.confidenceThreshold;
  return accepted ? approved : manualReviewDecision(outcome.taskClass);
}
