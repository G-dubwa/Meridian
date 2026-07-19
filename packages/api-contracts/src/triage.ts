import {
  assertionClassV1Schema,
  entryRevisionIdV1Schema,
  proposalAuthorityClassV1Schema,
  proposalIdV1Schema,
  proposalPayloadV1Schema,
  proposalStatusV1Schema,
  proposalTypeV1Schema,
} from '@meridian/domain';
import {
  acceptedReminderDetailsV1Schema,
  actionReceiptResponseV1Schema,
} from './actions.js';
import { z } from 'zod';

export const proposalResponseV1Schema = z
  .object({
    id: proposalIdV1Schema,
    sourceRevisionId: entryRevisionIdV1Schema,
    sourceSpanStart: z.number().int().nonnegative(),
    sourceSpanEnd: z.number().int().positive(),
    proposalType: proposalTypeV1Schema,
    payload: proposalPayloadV1Schema,
    authorityClass: proposalAuthorityClassV1Schema,
    assertionClass: assertionClassV1Schema,
    confidence: z.number().min(0).max(1),
    uncertaintyIndicators: z.array(z.string()),
    status: proposalStatusV1Schema,
    expiresAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    version: z.number().int().positive(),
  })
  .strict();

export const proposalListResponseV1Schema = z
  .object({ proposals: z.array(proposalResponseV1Schema) })
  .strict();

export const proposalDecisionRequestV1Schema = z
  .object({
    decision: z.enum(['accept', 'edit_accept', 'dismiss']),
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    editedPayload: proposalPayloadV1Schema.optional(),
    acceptedReminder: acceptedReminderDetailsV1Schema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decision === 'edit_accept' && input.editedPayload === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Edited acceptance requires editedPayload.',
        path: ['editedPayload'],
      });
    }
    if (input.decision !== 'edit_accept' && input.editedPayload !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'editedPayload is only valid with edit_accept.',
        path: ['editedPayload'],
      });
    }
    if (input.acceptedReminder !== undefined && input.decision === 'dismiss') {
      context.addIssue({
        code: 'custom',
        message: 'Dismissal cannot create a reminder target.',
        path: ['acceptedReminder'],
      });
    }
  });

export const interpretRevisionRequestV1Schema = z
  .object({ ownerConfirmedExternalProcessing: z.literal(true) })
  .strict();

export const proposalDecisionResponseV1Schema = z
  .object({
    action: actionReceiptResponseV1Schema.nullable(),
    proposal: proposalResponseV1Schema,
  })
  .strict();

export const interpretationDispositionResponseV1Schema = z
  .object({
    outcome: z.enum(['proposals', 'clarification', 'no_action']),
    proposals: z.array(proposalResponseV1Schema).max(7),
    clarificationQuestion: z.string().min(1).max(240).nullable(),
  })
  .strict();

export type ProposalResponseV1 = z.infer<typeof proposalResponseV1Schema>;
export type ProposalListResponseV1 = z.infer<
  typeof proposalListResponseV1Schema
>;
export type ProposalDecisionRequestV1 = z.infer<
  typeof proposalDecisionRequestV1Schema
>;
export type InterpretationDispositionResponseV1 = z.infer<
  typeof interpretationDispositionResponseV1Schema
>;
