import { z } from 'zod';
import {
  domainEventIdV1Schema,
  resourceIdV1Schema,
  uuidV1Schema,
} from './ids.js';
import { userScopeV1Schema } from './scope.js';

export const domainEventEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: domainEventIdV1Schema,
    eventType: z.string().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
    scope: userScopeV1Schema,
    aggregateId: resourceIdV1Schema.optional(),
    correlationId: uuidV1Schema,
    causationId: uuidV1Schema.optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type DomainEventEnvelopeV1 = z.infer<typeof domainEventEnvelopeV1Schema>;
