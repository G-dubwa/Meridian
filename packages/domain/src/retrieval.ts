import { z } from 'zod';
import {
  contextManifestIdV1Schema,
  entryRevisionIdV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  resourceIdV1Schema,
} from './ids.js';

export const retrievalLaneV1Schema = z.enum(['personal', 'external']);
export type RetrievalLane = z.infer<typeof retrievalLaneV1Schema>;

export const retrievalSourceKindV1Schema = z.enum([
  'entry_revision',
  'knowledge_chunk',
]);
export type RetrievalSourceKind = z.infer<typeof retrievalSourceKindV1Schema>;

export const retrievalMethodV1Schema = z.enum([
  'pinned',
  'metadata',
  'full_text',
  'semantic',
]);
export type RetrievalMethod = z.infer<typeof retrievalMethodV1Schema>;

export const contextEvidenceLaneV1Schema = z.enum([
  'personal_evidence',
  'external_evidence',
  'system_policy',
]);
export type ContextEvidenceLane = z.infer<typeof contextEvidenceLaneV1Schema>;

export const contextManifestPurposeV1Schema = z.enum([
  'recall_preview',
  'material_response',
]);
export type ContextManifestPurpose = z.infer<
  typeof contextManifestPurposeV1Schema
>;

export const retrievalSearchInputV1Schema = z
  .object({
    lanes: z
      .array(retrievalLaneV1Schema)
      .min(1)
      .max(2)
      .default(['personal', 'external']),
    limitPerLane: z.number().int().min(1).max(10).default(5),
    purpose: contextManifestPurposeV1Schema.default('recall_preview'),
    query: z.string().trim().min(2).max(500),
  })
  .strict();
export type RetrievalSearchInputV1 = z.infer<
  typeof retrievalSearchInputV1Schema
>;

export const retrievalEventTypeV1Schema = z.literal(
  'retrieval.context_manifest_created.v1',
);

export const retrievalEventPayloadV1Schema = z
  .object({
    externalItemCount: z.number().int().nonnegative(),
    manifestId: contextManifestIdV1Schema,
    personalItemCount: z.number().int().nonnegative(),
    policyVersion: z.string().min(1).max(80),
    purpose: contextManifestPurposeV1Schema,
    semanticRetrievalActive: z.boolean(),
  })
  .strict();

export const contextManifestReferenceV1Schema = z
  .object({
    contentHash: z.string().length(64),
    entryRevisionId: entryRevisionIdV1Schema.nullable(),
    knowledgeChunkId: knowledgeChunkIdV1Schema.nullable(),
    knowledgeSourceRevisionId: knowledgeSourceRevisionIdV1Schema.nullable(),
    resourceId: resourceIdV1Schema,
    sourceKind: retrievalSourceKindV1Schema,
  })
  .strict()
  .superRefine((reference, context) => {
    const personal =
      reference.sourceKind === 'entry_revision' &&
      reference.entryRevisionId !== null &&
      reference.knowledgeChunkId === null &&
      reference.knowledgeSourceRevisionId === null;
    const external =
      reference.sourceKind === 'knowledge_chunk' &&
      reference.entryRevisionId === null &&
      reference.knowledgeChunkId !== null &&
      reference.knowledgeSourceRevisionId !== null;
    if (!personal && !external)
      context.addIssue({
        code: 'custom',
        message: 'Manifest reference must identify exactly one evidence lane.',
      });
  });
