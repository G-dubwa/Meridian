import {
  interpretationDispositionResponseV1Schema,
  interpretRevisionRequestV1Schema,
  proposalDecisionRequestV1Schema,
  proposalListResponseV1Schema,
  proposalResponseV1Schema,
} from '@meridian/api-contracts';
import type { ProposalRecord } from '@meridian/domain';
import {
  IntegrationUnavailableError,
  entryRevisionIdV1Schema,
  proposalIdV1Schema,
} from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function responseFor(proposal: ProposalRecord) {
  return proposalResponseV1Schema.parse({
    assertionClass: proposal.assertionClass,
    authorityClass: proposal.authorityClass,
    confidence: proposal.confidence,
    createdAt: proposal.createdAt.toISOString(),
    expiresAt: proposal.expiresAt.toISOString(),
    id: proposal.id,
    payload: proposal.payload,
    proposalType: proposal.proposalType,
    sourceRevisionId: proposal.sourceRevisionId,
    sourceSpanEnd: proposal.sourceSpanEnd,
    sourceSpanStart: proposal.sourceSpanStart,
    status: proposal.status,
    uncertaintyIndicators: proposal.uncertaintyIndicators,
    version: proposal.version,
  });
}

export async function getTriageProposals(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const proposals = await authenticationRuntime().triage.list(scope);
    return jsonNoStore(
      proposalListResponseV1Schema.parse({
        proposals: proposals.map(responseFor),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postTriageDecision(
  request: NextRequest,
  proposalId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = proposalDecisionRequestV1Schema.parse(await request.json());
    const proposal = await authenticationRuntime().triage.decide(
      scope,
      proposalIdV1Schema.parse(proposalId),
      {
        decision: input.decision,
        expectedVersion: input.expectedVersion,
        ownerConfirmed: input.ownerConfirmed,
        ...(input.editedPayload === undefined
          ? {}
          : { editedPayload: input.editedPayload }),
      },
      context,
    );
    return jsonNoStore(responseFor(proposal));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postRevisionTriageProposals(
  request: NextRequest,
  revisionId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = interpretRevisionRequestV1Schema.parse(await request.json());
    const interpretation = authenticationRuntime().interpretation;
    if (!interpretation) throw new IntegrationUnavailableError();
    const disposition = await interpretation.proposeForRevision(
      scope,
      entryRevisionIdV1Schema.parse(revisionId),
      input.ownerConfirmedExternalProcessing,
      context,
    );
    return jsonNoStore(
      interpretationDispositionResponseV1Schema.parse({
        clarificationQuestion: disposition.clarificationQuestion,
        outcome: disposition.outcome,
        proposals: disposition.proposals.map(responseFor),
      }),
      disposition.outcome === 'proposals' ? 201 : 200,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
