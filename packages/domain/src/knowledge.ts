import { z } from 'zod';
import {
  knowledgeClaimIdV1Schema,
  knowledgeSourceIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
} from './ids.js';
import { processingClassV1Schema } from './processing-class.js';

export const knowledgeSourceClassV1Schema = z.enum([
  'systematic_review_or_meta_analysis',
  'randomised_trial',
  'controlled_non_randomised_study',
  'observational_study',
  'mechanistic_or_laboratory_study',
  'clinical_or_professional_guideline',
  'narrative_review',
  'expert_commentary',
  'book_or_chapter',
  'podcast_or_transcript',
  'personal_notes',
  'unknown',
]);
export type KnowledgeSourceClass = z.infer<typeof knowledgeSourceClassV1Schema>;

export const knowledgeReviewStatusV1Schema = z.enum([
  'unreviewed',
  'processing',
  'reviewed',
  'reference_only',
  'rejected',
  'superseded',
]);
export type KnowledgeReviewStatus = z.infer<
  typeof knowledgeReviewStatusV1Schema
>;

export const knowledgeCorrectionStatusV1Schema = z.enum([
  'unknown',
  'none_known',
  'corrected',
  'retracted',
  'expression_of_concern',
]);
export type KnowledgeCorrectionStatus = z.infer<
  typeof knowledgeCorrectionStatusV1Schema
>;

export const knowledgeFileFormatV1Schema = z.enum([
  'plain_text',
  'markdown',
  'pdf',
]);
export type KnowledgeFileFormat = z.infer<typeof knowledgeFileFormatV1Schema>;

export const knowledgeExtractionQualityV1Schema = z.enum([
  'complete',
  'partial',
  'ocr_required',
  'failed',
]);
export type KnowledgeExtractionQuality = z.infer<
  typeof knowledgeExtractionQualityV1Schema
>;

export const knowledgeLocatorV1Schema = z
  .object({
    end: z.number().int().nonnegative(),
    kind: z.enum(['page', 'section']),
    label: z.string().min(1).max(240),
    start: z.number().int().nonnegative(),
  })
  .strict()
  .refine((locator) => locator.end >= locator.start, {
    message: 'Locator end must not precede start.',
  });
export type KnowledgeLocatorV1 = z.infer<typeof knowledgeLocatorV1Schema>;

export const knowledgeClaimTypeV1Schema = z.enum([
  'finding',
  'mechanism',
  'recommendation',
  'limitation',
  'contraindication',
  'measurement',
  'population',
  'dose_or_schedule',
  'uncertainty',
]);
export type KnowledgeClaimType = z.infer<typeof knowledgeClaimTypeV1Schema>;

export const knowledgeEpistemicStatusV1Schema = z.enum([
  'reported_by_source',
  'supported',
  'mixed',
  'contested',
  'unsupported',
  'unknown',
]);
export type KnowledgeEpistemicStatus = z.infer<
  typeof knowledgeEpistemicStatusV1Schema
>;

export const knowledgeClaimReviewStatusV1Schema = z.enum([
  'candidate',
  'reviewed',
  'rejected',
  'superseded',
]);
export type KnowledgeClaimReviewStatus = z.infer<
  typeof knowledgeClaimReviewStatusV1Schema
>;

const optionalMetadataText = z.string().trim().min(1).max(1000).nullable();

export const createKnowledgeSourceMetadataV1Schema = z
  .object({
    authors: z.array(z.string().trim().min(1).max(240)).max(25),
    canonicalUrl: z.url().max(2000).nullable(),
    copyrightAndUseNotes: z.string().trim().min(1).max(2000),
    doi: z.string().trim().min(1).max(240).nullable(),
    evidenceDomain: z.array(z.string().trim().min(1).max(80)).max(20),
    language: z.string().trim().min(2).max(35),
    ownerConfirmed: z.literal(true),
    ownerConfirmedRights: z.literal(true),
    ownerNotes: optionalMetadataText,
    processingClass: processingClassV1Schema,
    publicationDate: z.iso.date().nullable(),
    publisherOrVenue: optionalMetadataText,
    sourceClass: knowledgeSourceClassV1Schema,
    title: z.string().trim().min(1).max(500),
  })
  .strict();
export type CreateKnowledgeSourceMetadataV1 = z.infer<
  typeof createKnowledgeSourceMetadataV1Schema
>;

export const reviewKnowledgeSourceInputV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    reviewStatus: z.enum(['reviewed', 'reference_only', 'rejected']),
  })
  .strict();

export const requestKnowledgeSourceDeletionInputV1Schema = z
  .object({
    confirmation: z.literal('REQUEST DELETE KNOWLEDGE SOURCE'),
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
  })
  .strict();

export const createKnowledgeSourceRevisionInputV1Schema = z
  .object({
    expectedSourceVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    ownerConfirmedRights: z.literal(true),
    processingClass: processingClassV1Schema,
  })
  .strict();

export const createKnowledgeClaimInputV1Schema = z
  .object({
    claimText: z.string().min(1).max(4000),
    claimType: knowledgeClaimTypeV1Schema,
    direction: optionalMetadataText,
    effectExpression: optionalMetadataText,
    interventionOrExposure: optionalMetadataText,
    outcome: optionalMetadataText,
    ownerConfirmed: z.literal(true),
    populationScope: optionalMetadataText,
    sourceRevisionId: knowledgeSourceRevisionIdV1Schema,
    sourceSpanEnd: z.number().int().positive(),
    sourceSpanStart: z.number().int().nonnegative(),
  })
  .strict()
  .refine((input) => input.sourceSpanEnd > input.sourceSpanStart, {
    message: 'Source span end must be greater than start.',
    path: ['sourceSpanEnd'],
  });

export const reviewKnowledgeClaimInputV1Schema = z
  .object({
    decision: z.enum(['reviewed', 'rejected']),
    expectedVersion: z.number().int().positive(),
    ownerConfirmed: z.literal(true),
    reviewerNotes: z.string().trim().max(2000).nullable(),
  })
  .strict();

export const knowledgeEventTypeV1Schema = z.enum([
  'knowledge.source_ingested.v1',
  'knowledge.source_revised.v1',
  'knowledge.source_reviewed.v1',
  'knowledge.source_deletion_requested.v1',
  'knowledge.claim_created.v1',
  'knowledge.claim_reviewed.v1',
]);
export type KnowledgeEventType = z.infer<typeof knowledgeEventTypeV1Schema>;

export const knowledgeEventPayloadV1Schema = z
  .object({
    claimId: knowledgeClaimIdV1Schema.nullable(),
    extractionQuality: knowledgeExtractionQualityV1Schema.nullable(),
    reviewStatus: z
      .union([
        knowledgeReviewStatusV1Schema,
        knowledgeClaimReviewStatusV1Schema,
      ])
      .nullable(),
    sourceId: knowledgeSourceIdV1Schema,
    sourceRevisionId: knowledgeSourceRevisionIdV1Schema.nullable(),
  })
  .strict();
