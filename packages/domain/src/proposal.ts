import { z } from 'zod';
import { DomainValidationError, InvalidAuthorityError } from './errors.js';
import { entryRevisionIdV1Schema, proposalIdV1Schema } from './ids.js';

export const proposalTypeV1Schema = z.enum([
  'task',
  'reminder',
  'commitment',
  'goal',
  'memory',
]);
export type ProposalType = z.infer<typeof proposalTypeV1Schema>;

export const proposalAuthorityClassV1Schema = z.enum([
  'ambiguous_command',
  'inferred_structure',
  'durable_claim',
  'external_action_preview',
]);
export type ProposalAuthorityClass = z.infer<
  typeof proposalAuthorityClassV1Schema
>;

export const assertionClassV1Schema = z.enum([
  'explicit_statement',
  'strong_interpretation',
  'weak_inference',
  'hypothesis',
]);
export type AssertionClass = z.infer<typeof assertionClassV1Schema>;

export const proposalStatusV1Schema = z.enum([
  'pending',
  'accepted',
  'edited_accepted',
  'dismissed',
  'stale',
  'expired',
]);
export type ProposalStatus = z.infer<typeof proposalStatusV1Schema>;

export const proposalPayloadV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: proposalTypeV1Schema,
    title: z.string().trim().min(1).max(240),
    detail: z.string().trim().min(1).max(2_000).optional(),
    temporalPhrase: z.string().trim().min(1).max(240).optional(),
  })
  .strict();
export type ProposalPayloadV1 = z.infer<typeof proposalPayloadV1Schema>;

export const proposalCandidateV1Schema = z
  .object({
    payload: proposalPayloadV1Schema,
    authorityClass: proposalAuthorityClassV1Schema,
    assertionClass: assertionClassV1Schema,
    confidence: z.number().min(0).max(1),
    dedupeKey: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevisionId: entryRevisionIdV1Schema,
    sourceSpanStart: z.number().int().nonnegative(),
    sourceSpanEnd: z.number().int().positive(),
    uncertaintyIndicators: z.array(z.string().trim().min(1).max(120)).max(8),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.sourceSpanEnd <= candidate.sourceSpanStart) {
      context.addIssue({
        code: 'custom',
        message: 'Source span end must be greater than its start.',
        path: ['sourceSpanEnd'],
      });
    }
  });
export type ProposalCandidateV1 = z.infer<typeof proposalCandidateV1Schema>;

export const interpretationOutputV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    outcome: z.enum(['proposals', 'clarification', 'no_action']),
    proposals: z.array(proposalCandidateV1Schema).max(7),
    clarificationQuestion: z.string().trim().min(1).max(240).nullable(),
    uncertaintyIndicators: z.array(z.string().trim().min(1).max(120)).max(8),
  })
  .strict()
  .superRefine((output, context) => {
    const valid =
      (output.outcome === 'proposals' &&
        output.proposals.length > 0 &&
        output.clarificationQuestion === null) ||
      (output.outcome === 'clarification' &&
        output.proposals.length === 0 &&
        output.clarificationQuestion !== null) ||
      (output.outcome === 'no_action' &&
        output.proposals.length === 0 &&
        output.clarificationQuestion === null);
    if (!valid) {
      context.addIssue({
        code: 'custom',
        message: 'Interpretation outcome fields are inconsistent.',
      });
    }
  });
export type InterpretationOutputV1 = z.infer<
  typeof interpretationOutputV1Schema
>;

export type InterpretationAuthorityDecisionV1 =
  | { readonly route: 'direct_command'; readonly authorityTier: 'T1' }
  | { readonly route: 'triage'; readonly authorityTier: 'T2' }
  | { readonly route: 'clarification'; readonly authorityTier: 'T0' }
  | { readonly route: 'external_preview'; readonly authorityTier: 'T3' }
  | { readonly route: 'reject'; readonly authorityTier: 'T4' };

export function routeInterpretationAuthorityV1(input: {
  readonly explicit: boolean;
  readonly deterministic: boolean;
  readonly ambiguous: boolean;
  readonly externalEffect: boolean;
  readonly prohibited: boolean;
}): InterpretationAuthorityDecisionV1 {
  if (input.prohibited) return { authorityTier: 'T4', route: 'reject' };
  if (input.ambiguous) return { authorityTier: 'T0', route: 'clarification' };
  if (input.externalEffect)
    return { authorityTier: 'T3', route: 'external_preview' };
  if (input.explicit && input.deterministic)
    return { authorityTier: 'T1', route: 'direct_command' };
  return { authorityTier: 'T2', route: 'triage' };
}

export function validateInterpretationOutputV1(
  output: InterpretationOutputV1,
  source: { readonly revisionId: string; readonly bodyLength: number },
): InterpretationOutputV1 {
  const parsed = interpretationOutputV1Schema.parse(output);
  const dedupeKeys = new Set<string>();
  for (const candidate of parsed.proposals) {
    if (
      candidate.sourceRevisionId !== source.revisionId ||
      candidate.sourceSpanEnd > source.bodyLength
    ) {
      throw new DomainValidationError('Proposal provenance is invalid.');
    }
    if (dedupeKeys.has(candidate.dedupeKey)) {
      throw new DomainValidationError(
        'Duplicate proposal candidates are invalid.',
      );
    }
    dedupeKeys.add(candidate.dedupeKey);
    if (candidate.authorityClass === 'ambiguous_command') {
      throw new InvalidAuthorityError(
        'Ambiguous commands must produce clarification, not proposals.',
      );
    }
    if (candidate.authorityClass === 'external_action_preview') {
      throw new InvalidAuthorityError(
        'External actions require an exact-preview workflow.',
      );
    }
  }
  return parsed;
}

export function transitionProposalStatusV1(
  current: ProposalStatus,
  decision: 'accept' | 'edit_accept' | 'dismiss' | 'stale' | 'expire',
  assertionClass: AssertionClass,
): ProposalStatus {
  if (current !== 'pending') {
    throw new DomainValidationError('Only pending proposals may transition.');
  }
  if (
    assertionClass === 'hypothesis' &&
    (decision === 'accept' || decision === 'edit_accept')
  ) {
    throw new InvalidAuthorityError(
      'A hypothesis cannot be accepted as durable structure.',
    );
  }
  return {
    accept: 'accepted',
    edit_accept: 'edited_accepted',
    dismiss: 'dismissed',
    stale: 'stale',
    expire: 'expired',
  }[decision] as ProposalStatus;
}

export const proposalEventTypeV1Schema = z.enum([
  'proposal.batch_created.v1',
  'proposal.accepted.v1',
  'proposal.edited_accepted.v1',
  'proposal.dismissed.v1',
]);
export type ProposalEventType = z.infer<typeof proposalEventTypeV1Schema>;

export const proposalEventPayloadV1Schema = z
  .object({
    proposalId: proposalIdV1Schema,
    status: proposalStatusV1Schema,
    proposalType: proposalTypeV1Schema,
  })
  .strict();

export const proposalBatchCreatedEventPayloadV1Schema = z
  .object({
    proposalIds: z.array(proposalIdV1Schema).min(1).max(7),
    proposalCount: z.number().int().min(1).max(7),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.proposalIds.length !== payload.proposalCount) {
      context.addIssue({
        code: 'custom',
        message: 'Proposal count must match proposal IDs.',
        path: ['proposalCount'],
      });
    }
  });
