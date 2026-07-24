import {
  createKnowledgeClaimInputV1Schema,
  createKnowledgeSourceMetadataV1Schema,
  createKnowledgeSourceRevisionInputV1Schema,
  knowledgeClaimIdV1Schema,
  knowledgeClaimReviewStatusV1Schema,
  knowledgeClaimTypeV1Schema,
  knowledgeCorrectionStatusV1Schema,
  knowledgeEpistemicStatusV1Schema,
  knowledgeExtractionQualityV1Schema,
  knowledgeFileFormatV1Schema,
  knowledgeLocatorV1Schema,
  knowledgeReviewStatusV1Schema,
  knowledgeSourceClassV1Schema,
  knowledgeSourceIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  processingClassV1Schema,
  requestKnowledgeSourceDeletionInputV1Schema,
  reviewKnowledgeClaimInputV1Schema,
  reviewKnowledgeSourceInputV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

const instant = z.iso.datetime({ offset: true });

export const knowledgeSourceResponseV1Schema = z
  .object({
    authors: z.array(z.string()),
    canonicalUrl: z.string().nullable(),
    copyrightAndUseNotes: z.string(),
    correctionStatus: knowledgeCorrectionStatusV1Schema,
    createdAt: instant,
    deletionRequestedAt: instant.nullable(),
    doi: z.string().nullable(),
    evidenceDomain: z.array(z.string()),
    id: knowledgeSourceIdV1Schema,
    language: z.string(),
    ownerNotes: z.string().nullable(),
    publicationDate: z.iso.date().nullable(),
    publisherOrVenue: z.string().nullable(),
    reviewStatus: knowledgeReviewStatusV1Schema,
    sourceClass: knowledgeSourceClassV1Schema,
    title: z.string(),
    updatedAt: instant,
    version: z.number().int().positive(),
  })
  .strict();

export const knowledgeRevisionResponseV1Schema = z
  .object({
    chunkCount: z.number().int().nonnegative(),
    createdAt: instant,
    extractionQuality: knowledgeExtractionQualityV1Schema,
    fileFormat: knowledgeFileFormatV1Schema,
    id: knowledgeSourceRevisionIdV1Schema,
    originalContentHash: z.string().length(64),
    originalFileName: z.string(),
    originalMediaType: z.string(),
    pageOrSectionMap: z.array(knowledgeLocatorV1Schema),
    parsedText: z.string(),
    parserId: z.string(),
    parserVersion: z.string(),
    processingClass: processingClassV1Schema,
    revisionNumber: z.number().int().positive(),
    sourceId: knowledgeSourceIdV1Schema,
  })
  .strict();

export const knowledgeCitationResponseV1Schema = z
  .object({
    id: z.uuid(),
    locator: knowledgeLocatorV1Schema.nullable(),
    quotedTextHash: z.string().length(64),
    sourceRevisionId: knowledgeSourceRevisionIdV1Schema,
    sourceSpanEnd: z.number().int().positive(),
    sourceSpanStart: z.number().int().nonnegative(),
  })
  .strict();

export const knowledgeClaimResponseV1Schema = z
  .object({
    citations: z.array(knowledgeCitationResponseV1Schema),
    claimText: z.string(),
    claimType: knowledgeClaimTypeV1Schema,
    createdAt: instant,
    direction: z.string().nullable(),
    effectExpression: z.string().nullable(),
    epistemicStatus: knowledgeEpistemicStatusV1Schema,
    id: knowledgeClaimIdV1Schema,
    interventionOrExposure: z.string().nullable(),
    outcome: z.string().nullable(),
    populationScope: z.string().nullable(),
    reviewStatus: knowledgeClaimReviewStatusV1Schema,
    reviewerNotes: z.string().nullable(),
    sourceId: knowledgeSourceIdV1Schema,
    updatedAt: instant,
    version: z.number().int().positive(),
  })
  .strict();

export const knowledgeSourceDetailResponseV1Schema = z
  .object({
    claims: z.array(knowledgeClaimResponseV1Schema),
    revisions: z.array(knowledgeRevisionResponseV1Schema),
    source: knowledgeSourceResponseV1Schema,
  })
  .strict();

export const knowledgeSourceListResponseV1Schema = z
  .object({ sources: z.array(knowledgeSourceResponseV1Schema) })
  .strict();

export const createKnowledgeSourceMetadataRequestV1Schema =
  createKnowledgeSourceMetadataV1Schema;
export const createKnowledgeSourceRevisionRequestV1Schema =
  createKnowledgeSourceRevisionInputV1Schema;
export const reviewKnowledgeSourceRequestV1Schema =
  reviewKnowledgeSourceInputV1Schema;
export const requestKnowledgeSourceDeletionRequestV1Schema =
  requestKnowledgeSourceDeletionInputV1Schema;
export const createKnowledgeClaimRequestV1Schema =
  createKnowledgeClaimInputV1Schema;
export const reviewKnowledgeClaimRequestV1Schema =
  reviewKnowledgeClaimInputV1Schema;

export type KnowledgeSourceDetailResponseV1 = z.infer<
  typeof knowledgeSourceDetailResponseV1Schema
>;
export type KnowledgeSourceResponseV1 = z.infer<
  typeof knowledgeSourceResponseV1Schema
>;
