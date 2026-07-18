import type {
  OutboxAttemptClaim,
  OutboxDispatchGateway,
  OutboxJobV1,
  OutboxMessageRecord,
  WorkerErrorCode,
  WorkerObservationV1,
  WorkerOutboxRepository,
} from '../../packages/domain/src/index.js';
import {
  domainEventEnvelopeV1Schema,
  outboxJobV1Schema,
  workerErrorCodeV1Schema,
  workerObservationV1Schema,
} from '../../packages/domain/src/index.js';
import {
  EventHandlingError,
  ReliableEventService,
} from '../../packages/application/src/reliable-events.js';
import { describe, expect, it } from 'vitest';

const job = outboxJobV1Schema.parse({
  domainEventId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01980',
  eventType: 'journal.entry_created.v1',
  outboxMessageId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
  schemaVersion: 1,
  userId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01982',
});
const event = domainEventEnvelopeV1Schema.parse({
  correlationId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01983',
  eventId: job.domainEventId,
  eventType: job.eventType,
  occurredAt: '2026-07-18T10:00:00.000Z',
  payload: { entryId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01984' },
  schemaVersion: 1,
  scope: { userId: job.userId },
});
const message: OutboxMessageRecord = {
  attempts: 0,
  availableAt: new Date('2026-07-18T10:00:00.000Z'),
  createdAt: new Date('2026-07-18T10:00:00.000Z'),
  deadLetteredAt: null,
  event,
  id: job.outboxMessageId,
  lastErrorAt: null,
  lastErrorCode: null,
  processedAt: null,
  status: 'in_flight',
  topic: job.eventType,
};

class FakeWorkerOutbox implements WorkerOutboxRepository {
  public claim: OutboxAttemptClaim = { message, state: 'claimed' };
  public failures: { code: WorkerErrorCode; terminal: boolean }[] = [];
  public succeeded = 0;

  public claimAttempt(): Promise<OutboxAttemptClaim> {
    return Promise.resolve(this.claim);
  }

  public markSucceeded(): Promise<boolean> {
    this.succeeded += 1;
    return Promise.resolve(true);
  }

  public markFailed(
    _job: OutboxJobV1,
    _attempt: number,
    code: WorkerErrorCode,
    _failedAt: Date,
    terminal: boolean,
  ): Promise<boolean> {
    this.failures.push({ code, terminal });
    return Promise.resolve(true);
  }
}

function serviceWith(
  outbox: FakeWorkerOutbox,
  handle: () => Promise<void>,
  observations: WorkerObservationV1[],
) {
  const dispatcher: OutboxDispatchGateway = {
    dispatchAvailable: () => Promise.resolve([job]),
  };
  return new ReliableEventService({
    clock: { now: () => new Date('2026-07-18T10:00:01.000Z') },
    consumer: { handle },
    dispatcher,
    observations: { observe: (observation) => observations.push(observation) },
    outbox,
  });
}

describe('WP-06 reliable event processing', () => {
  it('keeps job and observation contracts content-free', () => {
    expect(() =>
      outboxJobV1Schema.parse({ ...job, bodyMarkdown: 'secret' }),
    ).toThrow();
    expect(() =>
      workerObservationV1Schema.parse({
        bodyMarkdown: 'secret',
        name: 'worker.error',
        occurredAt: '2026-07-18T10:00:00.000Z',
        schemaVersion: 1,
      }),
    ).toThrow();
  });

  it('succeeds once and treats duplicate delivery as idempotent success', async () => {
    const outbox = new FakeWorkerOutbox();
    const observations: WorkerObservationV1[] = [];
    const service = serviceWith(outbox, () => Promise.resolve(), observations);
    await expect(service.process(job, 1)).resolves.toEqual({
      state: 'succeeded',
    });
    expect(outbox.succeeded).toBe(1);
    outbox.claim = { state: 'succeeded' };
    await expect(service.process(job, 2)).resolves.toEqual({
      state: 'succeeded',
    });
    expect(outbox.succeeded).toBe(1);
    expect(observations.map((value) => value.name)).toEqual([
      'outbox.attempt_started',
      'outbox.succeeded',
    ]);
  });

  it('records retry then terminal dead letter without exposing exception text', async () => {
    const outbox = new FakeWorkerOutbox();
    const observations: WorkerObservationV1[] = [];
    const code = workerErrorCodeV1Schema.parse('CONTROLLED_FAILURE');
    const service = serviceWith(
      outbox,
      () => Promise.reject(new EventHandlingError(code, true)),
      observations,
    );
    await expect(service.process(job, 1, 2)).resolves.toEqual({
      errorCode: code,
      state: 'retry',
    });
    await expect(service.process(job, 2, 2)).resolves.toEqual({
      errorCode: code,
      state: 'dead_letter',
    });
    expect(outbox.failures).toEqual([
      { code, terminal: false },
      { code, terminal: true },
    ]);
    expect(JSON.stringify(observations)).not.toContain('ErrorHandlingError');
    expect(JSON.stringify(observations)).not.toContain('secret');
  });
});
