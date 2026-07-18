import { z } from 'zod';
import { entryIdV1Schema, entryRevisionIdV1Schema } from './ids.js';
import { processingClassV1Schema } from './processing-class.js';

export const journalEntryStatusV1Schema = z.enum([
  'active',
  'archived',
  'deletion_requested',
]);
export type JournalEntryStatus = z.infer<typeof journalEntryStatusV1Schema>;

export const journalBodyMarkdownV1Schema = z
  .string()
  .max(100_000)
  .refine((value) => value.trim().length > 0, 'Entry body cannot be empty.');
export type JournalBodyMarkdown = z.infer<typeof journalBodyMarkdownV1Schema>;

export const journalChangeKindV1Schema = z.enum([
  'content',
  'privacy',
  'redaction',
  'metadata',
]);
export type JournalChangeKind = z.infer<typeof journalChangeKindV1Schema>;

export const journalEventTypeV1Schema = z.enum([
  'journal.entry_created.v1',
  'journal.entry_revised.v1',
  'journal.entry_privacy_changed.v1',
  'journal.entry_archived.v1',
  'journal.entry_deletion_requested.v1',
]);
export type JournalEventType = z.infer<typeof journalEventTypeV1Schema>;

export const journalRevisionEventPayloadV1Schema = z
  .object({
    entryId: entryIdV1Schema,
    revisionId: entryRevisionIdV1Schema,
    revisionNumber: z.number().int().positive(),
    processingClass: processingClassV1Schema,
    changeKind: journalChangeKindV1Schema,
  })
  .strict();
export type JournalRevisionEventPayloadV1 = z.infer<
  typeof journalRevisionEventPayloadV1Schema
>;

export const journalLifecycleEventPayloadV1Schema = z
  .object({
    entryId: entryIdV1Schema,
    entryVersion: z.number().int().positive(),
  })
  .strict();
export type JournalLifecycleEventPayloadV1 = z.infer<
  typeof journalLifecycleEventPayloadV1Schema
>;
