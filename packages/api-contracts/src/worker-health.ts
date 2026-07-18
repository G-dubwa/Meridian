import {
  domainEventIdV1Schema,
  outboxMessageIdV1Schema,
  workerErrorCodeV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

export const workerDeadLetterV1Schema = z
  .object({
    attempts: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    deadLetteredAt: z.iso.datetime({ offset: true }),
    domainEventId: domainEventIdV1Schema,
    errorCode: workerErrorCodeV1Schema,
    eventType: z.string().min(1).max(160),
    outboxMessageId: outboxMessageIdV1Schema,
  })
  .strict();

export const workerHealthResponseV1Schema = z
  .object({
    pending: z.number().int().nonnegative(),
    inFlight: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    uncertain: z.number().int().nonnegative(),
    oldestUnfinishedAt: z.iso.datetime({ offset: true }).nullable(),
    deadLetters: z.array(workerDeadLetterV1Schema).max(20),
  })
  .strict();

export type WorkerHealthResponseV1 = z.infer<
  typeof workerHealthResponseV1Schema
>;

export async function getWorkerHealthV1(
  fetcher: typeof fetch = fetch,
): Promise<WorkerHealthResponseV1> {
  const response = await fetcher('/api/system/worker-health', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Worker health request failed.');
  return workerHealthResponseV1Schema.parse(await response.json());
}
