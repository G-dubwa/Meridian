import {
  contextManifestResponseV1Schema,
  retrievalPreviewRequestV1Schema,
  retrievalPreviewResponseV1Schema,
  retrievalStatusResponseV1Schema,
} from '@meridian/api-contracts';
import type {
  ContextManifestItemRecord,
  ContextManifestRecord,
  RetrievalCandidateRecord,
} from '@meridian/domain';
import { NotFoundError } from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function hrefFor(
  sourceKind: ContextManifestItemRecord['sourceKind'],
  resourceId: ContextManifestItemRecord['resourceId'],
): string | null {
  if (sourceKind === 'entry_revision' && resourceId)
    return `/journal/${resourceId}`;
  if (sourceKind === 'knowledge_chunk' && resourceId)
    return `/knowledge?source=${resourceId}`;
  return null;
}

function manifestResponse(manifest: ContextManifestRecord) {
  return contextManifestResponseV1Schema.parse({
    createdAt: manifest.createdAt.toISOString(),
    id: manifest.id,
    items: manifest.items.map((item) => ({
      contentHash: item.contentHash,
      entryRevisionId: item.entryRevisionId,
      evidenceLane: item.evidenceLane,
      href: hrefFor(item.sourceKind, item.resourceId),
      knowledgeChunkId: item.knowledgeChunkId,
      knowledgeSourceRevisionId: item.knowledgeSourceRevisionId,
      methods: item.methods,
      ordinal: item.ordinal,
      policyReference: item.policyReference,
      resourceId: item.resourceId,
      score: item.score,
      sourceKind: item.sourceKind,
    })),
    policyVersion: manifest.policyVersion,
    purpose: manifest.purpose,
    semanticRetrievalActive: manifest.semanticRetrievalActive,
  });
}

function resultResponse(candidate: RetrievalCandidateRecord) {
  const excerpt =
    candidate.text.length <= 360
      ? candidate.text
      : `${candidate.text.slice(0, 357)}…`;
  return {
    contentHash: candidate.contentHash,
    entryRevisionId: candidate.entryRevisionId,
    evidenceLane: candidate.evidenceLane,
    excerpt,
    href:
      hrefFor(candidate.sourceKind, candidate.resourceId) ??
      '/settings/security',
    knowledgeChunkId: candidate.knowledgeChunkId,
    knowledgeSourceRevisionId: candidate.knowledgeSourceRevisionId,
    locator: candidate.locator,
    methods: candidate.methods,
    occurredAt: candidate.occurredAt.toISOString(),
    resourceId: candidate.resourceId,
    score: candidate.score,
    sourceKind: candidate.sourceKind,
    title: candidate.title,
  };
}

export async function getRetrievalStatus(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuthenticatedScope(request);
    return jsonNoStore(
      retrievalStatusResponseV1Schema.parse(
        authenticationRuntime().retrieval.status,
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postRetrievalPreview(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = retrievalPreviewRequestV1Schema.parse(await request.json());
    const preview = await authenticationRuntime().retrieval.preview(
      scope,
      input,
      context,
    );
    return jsonNoStore(
      retrievalPreviewResponseV1Schema.parse({
        manifest: manifestResponse(preview.manifest),
        results: preview.candidates.map(resultResponse),
        status: authenticationRuntime().retrieval.status,
      }),
      201,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getContextManifest(
  request: NextRequest,
  manifestId: string,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const manifest = await authenticationRuntime().retrieval.manifest(
      scope,
      manifestId,
    );
    if (!manifest) throw new NotFoundError('Context manifest was not found.');
    return jsonNoStore(manifestResponse(manifest));
  } catch (error) {
    return httpErrorResponse(error);
  }
}
