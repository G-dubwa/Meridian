import { z } from 'zod';
import {
  domainEventIdV1Schema,
  outboxMessageIdV1Schema,
  userIdV1Schema,
} from './ids.js';

export const outboxJobV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    outboxMessageId: outboxMessageIdV1Schema,
    userId: userIdV1Schema,
    domainEventId: domainEventIdV1Schema,
    eventType: z.string().min(1).max(160),
  })
  .strict();
export type OutboxJobV1 = z.infer<typeof outboxJobV1Schema>;

export const workerErrorCodeV1Schema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/);
export type WorkerErrorCode = z.infer<typeof workerErrorCodeV1Schema>;

export const workerObservationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.enum([
      'outbox.dispatched',
      'outbox.attempt_started',
      'outbox.succeeded',
      'outbox.retry_scheduled',
      'outbox.dead_lettered',
      'worker.error',
    ]),
    occurredAt: z.iso.datetime({ offset: true }),
    outboxMessageId: outboxMessageIdV1Schema.optional(),
    domainEventId: domainEventIdV1Schema.optional(),
    eventType: z.string().min(1).max(160).optional(),
    attempt: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    errorCode: workerErrorCodeV1Schema.optional(),
  })
  .strict();
export type WorkerObservationV1 = z.infer<typeof workerObservationV1Schema>;

export interface OutboxDeadLetterSummary {
  readonly outboxMessageId: z.infer<typeof outboxMessageIdV1Schema>;
  readonly domainEventId: z.infer<typeof domainEventIdV1Schema>;
  readonly eventType: string;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly deadLetteredAt: Date;
  readonly errorCode: WorkerErrorCode;
}

export interface OutboxHealthSnapshot {
  readonly pending: number;
  readonly inFlight: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly uncertain: number;
  readonly oldestUnfinishedAt: Date | null;
  readonly deadLetters: readonly OutboxDeadLetterSummary[];
}
