import {
  createKnowledgeClaimRequestV1Schema,
  createKnowledgeSourceMetadataRequestV1Schema,
  createKnowledgeSourceRevisionRequestV1Schema,
  knowledgeClaimResponseV1Schema,
  knowledgeRevisionResponseV1Schema,
  knowledgeSourceDetailResponseV1Schema,
  knowledgeSourceListResponseV1Schema,
  knowledgeSourceResponseV1Schema,
  reviewKnowledgeClaimRequestV1Schema,
  reviewKnowledgeSourceRequestV1Schema,
  requestKnowledgeSourceDeletionRequestV1Schema,
} from '@meridian/api-contracts';
import type {
  KnowledgeClaimCitationRecord,
  KnowledgeClaimRecord,
  KnowledgeSourceRecord,
  KnowledgeSourceRevisionRecord,
} from '@meridian/domain';
import type { KnowledgeSourceDetail } from '@meridian/application';
import {
  DomainValidationError,
  IntegrationUnavailableError,
} from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function service() {
  const knowledge = authenticationRuntime().knowledge;
  if (!knowledge) throw new IntegrationUnavailableError();
  return knowledge;
}

function sourceResponse(source: KnowledgeSourceRecord) {
  return knowledgeSourceResponseV1Schema.parse({
    authors: source.authors,
    canonicalUrl: source.canonicalUrl,
    copyrightAndUseNotes: source.copyrightAndUseNotes,
    correctionStatus: source.correctionStatus,
    createdAt: source.createdAt.toISOString(),
    deletionRequestedAt: source.deletionRequestedAt?.toISOString() ?? null,
    doi: source.doi,
    evidenceDomain: source.evidenceDomain,
    id: source.id,
    language: source.language,
    ownerNotes: source.ownerNotes,
    publicationDate: source.publicationDate,
    publisherOrVenue: source.publisherOrVenue,
    reviewStatus: source.reviewStatus,
    sourceClass: source.sourceClass,
    title: source.title,
    updatedAt: source.updatedAt.toISOString(),
    version: source.version,
  });
}

function revisionResponse(
  revision: KnowledgeSourceRevisionRecord,
  chunkCount: number,
) {
  return knowledgeRevisionResponseV1Schema.parse({
    chunkCount,
    createdAt: revision.createdAt.toISOString(),
    extractionQuality: revision.extractionQuality,
    fileFormat: revision.fileFormat,
    id: revision.id,
    originalContentHash: revision.originalContentHash,
    originalFileName: revision.originalFileName,
    originalMediaType: revision.originalMediaType,
    pageOrSectionMap: revision.pageOrSectionMap,
    parsedText: revision.parsedText,
    parserId: revision.parserId,
    parserVersion: revision.parserVersion,
    processingClass: revision.processingClass,
    revisionNumber: revision.revisionNumber,
    sourceId: revision.knowledgeSourceId,
  });
}

function claimResponse(
  claim: KnowledgeClaimRecord,
  citations: readonly KnowledgeClaimCitationRecord[],
) {
  return knowledgeClaimResponseV1Schema.parse({
    citations: citations.map((citation) => ({
      id: citation.id,
      locator: citation.locator,
      quotedTextHash: citation.quotedTextHash,
      sourceRevisionId: citation.sourceRevisionId,
      sourceSpanEnd: citation.sourceSpanEnd,
      sourceSpanStart: citation.sourceSpanStart,
    })),
    claimText: claim.claimText,
    claimType: claim.claimType,
    createdAt: claim.createdAt.toISOString(),
    direction: claim.direction,
    effectExpression: claim.effectExpression,
    epistemicStatus: claim.epistemicStatus,
    id: claim.id,
    interventionOrExposure: claim.interventionOrExposure,
    outcome: claim.outcome,
    populationScope: claim.populationScope,
    reviewStatus: claim.reviewStatus,
    reviewerNotes: claim.reviewerNotes,
    sourceId: claim.knowledgeSourceId,
    updatedAt: claim.updatedAt.toISOString(),
    version: claim.version,
  });
}

function detailResponse(detail: KnowledgeSourceDetail) {
  return knowledgeSourceDetailResponseV1Schema.parse({
    claims: detail.claims.map(({ citations, claim }) =>
      claimResponse(claim, citations),
    ),
    revisions: detail.revisions.map(({ chunkCount, revision }) =>
      revisionResponse(revision, chunkCount),
    ),
    source: sourceResponse(detail.source),
  });
}

function parseJsonFormValue(form: FormData, name: string): unknown {
  const value = form.get(name);
  if (typeof value !== 'string')
    throw new DomainValidationError(`${name} form field is required.`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new DomainValidationError(`${name} form field is invalid JSON.`);
  }
}

async function uploadFrom(form: FormData, maximumBytes: number) {
  const file = form.get('file');
  if (!(file instanceof File))
    throw new DomainValidationError('A source file is required.');
  if (file.size > maximumBytes)
    throw new DomainValidationError('The uploaded source is too large.');
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    mediaType: file.type || 'application/octet-stream',
  };
}

export async function getKnowledgeSources(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    return jsonNoStore(
      knowledgeSourceListResponseV1Schema.parse({
        sources: (await service().list(scope)).map(sourceResponse),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeSource(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const form = await request.formData();
    const metadata = createKnowledgeSourceMetadataRequestV1Schema.parse(
      parseJsonFormValue(form, 'metadata'),
    );
    const knowledge = service();
    const detail = await knowledge.upload(
      scope,
      metadata,
      await uploadFrom(form, knowledge.maximumUploadBytes),
      context,
    );
    return jsonNoStore(detailResponse(detail), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getKnowledgeSource(
  request: NextRequest,
  sourceId: string,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    return jsonNoStore(detailResponse(await service().detail(scope, sourceId)));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeRevision(
  request: NextRequest,
  sourceId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const form = await request.formData();
    const input = createKnowledgeSourceRevisionRequestV1Schema.parse(
      parseJsonFormValue(form, 'metadata'),
    );
    const knowledge = service();
    return jsonNoStore(
      detailResponse(
        await knowledge.revise(
          scope,
          sourceId,
          input,
          await uploadFrom(form, knowledge.maximumUploadBytes),
          context,
        ),
      ),
      201,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeSourceReview(
  request: NextRequest,
  sourceId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = reviewKnowledgeSourceRequestV1Schema.parse(
      await request.json(),
    );
    return jsonNoStore(
      sourceResponse(
        await service().reviewSource(scope, sourceId, input, context),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeSourceDeletionRequest(
  request: NextRequest,
  sourceId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = requestKnowledgeSourceDeletionRequestV1Schema.parse(
      await request.json(),
    );
    return jsonNoStore(
      sourceResponse(
        await service().requestDeletion(scope, sourceId, input, context),
      ),
      202,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeClaim(
  request: NextRequest,
  sourceId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createKnowledgeClaimRequestV1Schema.parse(
      await request.json(),
    );
    const claim = await service().createClaim(scope, sourceId, input, context);
    const detail = await service().detail(scope, sourceId);
    const created = detail.claims.find((item) => item.claim.id === claim.id);
    if (!created)
      throw new DomainValidationError('Created claim could not be reloaded.');
    return jsonNoStore(claimResponse(created.claim, created.citations), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postKnowledgeClaimReview(
  request: NextRequest,
  claimId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = reviewKnowledgeClaimRequestV1Schema.parse(
      await request.json(),
    );
    const claim = await service().reviewClaim(scope, claimId, input, context);
    const detail = await service().detail(scope, claim.knowledgeSourceId);
    const reviewed = detail.claims.find((item) => item.claim.id === claim.id);
    if (!reviewed)
      throw new DomainValidationError('Reviewed claim could not be reloaded.');
    return jsonNoStore(claimResponse(reviewed.claim, reviewed.citations));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getKnowledgeOriginal(
  request: NextRequest,
  revisionId: string,
): Promise<Response> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const original = await service().original(scope, revisionId);
    return new Response(Uint8Array.from(original.bytes).buffer, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(original.fileName)}`,
        'Content-Type': original.mediaType,
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return httpErrorResponse(error);
  }
}
