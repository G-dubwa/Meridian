import {
  entryIdV1Schema,
  entryRevisionIdV1Schema,
  journalBodyMarkdownV1Schema,
  journalChangeKindV1Schema,
  journalEntryStatusV1Schema,
  journalEventTypeV1Schema,
  processingClassV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

export const createJournalEntryRequestV1Schema = z
  .object({
    bodyMarkdown: journalBodyMarkdownV1Schema,
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    processingClass: processingClassV1Schema,
  })
  .strict();

export const reviseJournalEntryRequestV1Schema =
  createJournalEntryRequestV1Schema
    .extend({ expectedVersion: z.number().int().positive() })
    .strict();

export const journalLifecycleRequestV1Schema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const journalHardDeletionRequestV1Schema = z
  .object({
    confirmHardDeletion: z.literal(true),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const journalRevisionResponseV1Schema = z
  .object({
    id: entryRevisionIdV1Schema,
    revisionNumber: z.number().int().positive(),
    bodyMarkdown: journalBodyMarkdownV1Schema,
    occurredAt: z.iso.datetime({ offset: true }),
    processingClass: processingClassV1Schema,
    changeKind: journalChangeKindV1Schema,
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.enum(['user', 'system']),
  })
  .strict();

export const journalEntrySummaryResponseV1Schema = z
  .object({
    id: entryIdV1Schema,
    status: journalEntryStatusV1Schema,
    version: z.number().int().positive(),
    processingClass: processingClassV1Schema,
    bodyMarkdown: journalBodyMarkdownV1Schema,
    occurredAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const journalEntryResponseV1Schema = z
  .object({
    entry: journalEntrySummaryResponseV1Schema,
    revisions: z.array(journalRevisionResponseV1Schema).min(1),
  })
  .strict();

export const journalEntryListResponseV1Schema = z
  .object({ entries: z.array(journalEntrySummaryResponseV1Schema) })
  .strict();

export const journalActivityItemResponseV1Schema = z
  .object({
    eventId: uuidV1Schema,
    eventType: journalEventTypeV1Schema,
    occurredAt: z.iso.datetime({ offset: true }),
    entryId: entryIdV1Schema,
  })
  .strict();

export const journalActivityResponseV1Schema = z
  .object({ activity: z.array(journalActivityItemResponseV1Schema) })
  .strict();

export type CreateJournalEntryRequestV1 = z.infer<
  typeof createJournalEntryRequestV1Schema
>;
export type ReviseJournalEntryRequestV1 = z.infer<
  typeof reviseJournalEntryRequestV1Schema
>;
export type JournalEntryResponseV1 = z.infer<
  typeof journalEntryResponseV1Schema
>;
export type JournalEntryListResponseV1 = z.infer<
  typeof journalEntryListResponseV1Schema
>;
export type JournalActivityResponseV1 = z.infer<
  typeof journalActivityResponseV1Schema
>;
