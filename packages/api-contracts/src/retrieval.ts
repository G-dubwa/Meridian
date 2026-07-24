import {
  contextEvidenceLaneV1Schema,
  contextManifestIdV1Schema,
  contextManifestPurposeV1Schema,
  entryRevisionIdV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeLocatorV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  resourceIdV1Schema,
  retrievalLaneV1Schema,
  retrievalMethodV1Schema,
  retrievalSourceKindV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

const instant = z.iso.datetime({ offset: true });

export const retrievalPreviewRequestV1Schema = z
  .object({
    lanes: z
      .array(retrievalLaneV1Schema)
      .min(1)
      .max(2)
      .default(['personal', 'external']),
    limitPerLane: z.number().int().min(1).max(10).default(5),
    purpose: z.literal('recall_preview').default('recall_preview'),
    query: z.string().trim().min(2).max(500),
  })
  .strict();

export const retrievalStatusResponseV1Schema = z
  .object({
    externalLane: z.literal('local_full_text'),
    personalLane: z.literal('local_full_text'),
    policyVersion: z.string(),
    semanticRetrieval: z.literal('inactive'),
  })
  .strict();

export const retrievalResultResponseV1Schema = z
  .object({
    contentHash: z.string().length(64),
    entryRevisionId: entryRevisionIdV1Schema.nullable(),
    evidenceLane: z.enum(['personal_evidence', 'external_evidence']),
    excerpt: z.string().max(360),
    href: z.string().startsWith('/'),
    knowledgeChunkId: knowledgeChunkIdV1Schema.nullable(),
    knowledgeSourceRevisionId: knowledgeSourceRevisionIdV1Schema.nullable(),
    locator: knowledgeLocatorV1Schema.nullable(),
    methods: z.array(retrievalMethodV1Schema).min(1),
    occurredAt: instant,
    resourceId: resourceIdV1Schema,
    score: z.number().min(0).max(1),
    sourceKind: retrievalSourceKindV1Schema,
    title: z.string().min(1).max(500),
  })
  .strict();

export const contextManifestItemResponseV1Schema = z
  .object({
    contentHash: z.string().length(64).nullable(),
    entryRevisionId: entryRevisionIdV1Schema.nullable(),
    evidenceLane: contextEvidenceLaneV1Schema,
    href: z.string().startsWith('/').nullable(),
    knowledgeChunkId: knowledgeChunkIdV1Schema.nullable(),
    knowledgeSourceRevisionId: knowledgeSourceRevisionIdV1Schema.nullable(),
    methods: z.array(retrievalMethodV1Schema),
    ordinal: z.number().int().positive(),
    policyReference: z.string().nullable(),
    resourceId: resourceIdV1Schema.nullable(),
    score: z.number().min(0).max(1).nullable(),
    sourceKind: retrievalSourceKindV1Schema.nullable(),
  })
  .strict();

export const contextManifestResponseV1Schema = z
  .object({
    createdAt: instant,
    id: contextManifestIdV1Schema,
    items: z.array(contextManifestItemResponseV1Schema),
    policyVersion: z.string(),
    purpose: contextManifestPurposeV1Schema,
    semanticRetrievalActive: z.boolean(),
  })
  .strict();

export const retrievalPreviewResponseV1Schema = z
  .object({
    manifest: contextManifestResponseV1Schema,
    results: z.array(retrievalResultResponseV1Schema),
    status: retrievalStatusResponseV1Schema,
  })
  .strict();

export type RetrievalPreviewResponseV1 = z.infer<
  typeof retrievalPreviewResponseV1Schema
>;
export type RetrievalStatusResponseV1 = z.infer<
  typeof retrievalStatusResponseV1Schema
>;
