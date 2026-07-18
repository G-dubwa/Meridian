import {
  outboxJobV1Schema,
  workerErrorCodeV1Schema,
  workerObservationV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  DomainEventEnvelopeV1,
  OutboxDispatchGateway,
  OutboxHealthSnapshot,
  OutboxJobV1,
  TransactionManager,
  UserScope,
  WorkerErrorCode,
  WorkerObservationV1,
  WorkerObservationSink,
  WorkerOutboxRepository,
} from '@meridian/domain';

export const OUTBOX_QUEUE_V1 = 'meridian.outbox.v1';
export const OUTBOX_DEAD_LETTER_QUEUE_V1 = 'meridian.outbox.dead.v1';
export const OUTBOX_RETRY_LIMIT = 2;
export const OUTBOX_MAX_ATTEMPTS = OUTBOX_RETRY_LIMIT + 1;

export interface ReliableEventConsumer {
  handle(
    event: DomainEventEnvelopeV1,
    idempotencyKey: DomainEventEnvelopeV1['eventId'],
  ): Promise<void>;
}

export class EventHandlingError extends Error {
  public constructor(
    public readonly code: WorkerErrorCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'EventHandlingError';
  }
}

export class FoundationJournalEventConsumer implements ReliableEventConsumer {
  public handle(event: DomainEventEnvelopeV1): Promise<void> {
    if (!event.eventType.startsWith('journal.')) {
      throw new EventHandlingError(
        workerErrorCodeV1Schema.parse('UNSUPPORTED_EVENT_TYPE'),
        false,
      );
    }
    return Promise.resolve();
  }
}

export type ReliableEventProcessOutcome =
  | { readonly state: 'succeeded' }
  | { readonly state: 'retry'; readonly errorCode: WorkerErrorCode }
  | { readonly state: 'dead_letter'; readonly errorCode: WorkerErrorCode };

export interface ReliableEventServiceDependencies {
  readonly clock: Clock;
  readonly dispatcher: OutboxDispatchGateway;
  readonly outbox: WorkerOutboxRepository;
  readonly consumer: ReliableEventConsumer;
  readonly observations: WorkerObservationSink;
}

function errorDetails(error: unknown): {
  readonly code: WorkerErrorCode;
  readonly retryable: boolean;
} {
  if (error instanceof EventHandlingError)
    return { code: error.code, retryable: error.retryable };
  return {
    code: workerErrorCodeV1Schema.parse('UNEXPECTED_HANDLER_FAILURE'),
    retryable: true,
  };
}

export class ReliableEventService {
  public constructor(
    private readonly dependencies: ReliableEventServiceDependencies,
  ) {}

  public async dispatchAvailable(
    scope: UserScope,
    limit = 20,
  ): Promise<readonly OutboxJobV1[]> {
    const now = this.dependencies.clock.now();
    const jobs = await this.dependencies.dispatcher.dispatchAvailable(
      scope,
      now,
      limit,
    );
    for (const job of jobs)
      this.observe(job, 'outbox.dispatched', now, undefined);
    return jobs;
  }

  public async process(
    input: OutboxJobV1,
    attempt: number,
    maxAttempts = OUTBOX_MAX_ATTEMPTS,
  ): Promise<ReliableEventProcessOutcome> {
    const job = outboxJobV1Schema.parse(input);
    const startedAt = this.dependencies.clock.now();
    const claim = await this.dependencies.outbox.claimAttempt(
      job,
      attempt,
      startedAt,
    );
    if (claim.state === 'succeeded' || claim.state === 'duplicate')
      return { state: 'succeeded' };
    if (claim.state === 'dead_lettered')
      return {
        errorCode: workerErrorCodeV1Schema.parse('PREVIOUSLY_DEAD_LETTERED'),
        state: 'dead_letter',
      };
    if (claim.state === 'missing')
      return {
        errorCode: workerErrorCodeV1Schema.parse('OUTBOX_MESSAGE_MISSING'),
        state: 'dead_letter',
      };

    this.observe(job, 'outbox.attempt_started', startedAt, attempt);
    try {
      await this.dependencies.consumer.handle(
        claim.message.event,
        claim.message.event.eventId,
      );
      const processedAt = this.dependencies.clock.now();
      const recorded = await this.dependencies.outbox.markSucceeded(
        job,
        attempt,
        processedAt,
      );
      if (!recorded)
        throw new EventHandlingError(
          workerErrorCodeV1Schema.parse('OUTBOX_STATE_CONFLICT'),
          true,
        );
      this.observe(
        job,
        'outbox.succeeded',
        processedAt,
        attempt,
        processedAt.getTime() - startedAt.getTime(),
      );
      return { state: 'succeeded' };
    } catch (error) {
      const failure = errorDetails(error);
      const failedAt = this.dependencies.clock.now();
      const terminal = !failure.retryable || attempt >= maxAttempts;
      const recorded = await this.dependencies.outbox.markFailed(
        job,
        attempt,
        failure.code,
        failedAt,
        terminal,
      );
      if (!recorded) throw error;
      this.observe(
        job,
        terminal ? 'outbox.dead_lettered' : 'outbox.retry_scheduled',
        failedAt,
        attempt,
        failedAt.getTime() - startedAt.getTime(),
        failure.code,
      );
      return terminal
        ? { errorCode: failure.code, state: 'dead_letter' }
        : { errorCode: failure.code, state: 'retry' };
    }
  }

  private observe(
    job: OutboxJobV1,
    name: Exclude<WorkerObservationV1['name'], 'worker.error'>,
    occurredAt: Date,
    attempt: number | undefined,
    durationMs?: number,
    errorCode?: WorkerErrorCode,
  ): void {
    this.dependencies.observations.observe(
      workerObservationV1Schema.parse({
        ...(attempt === undefined ? {} : { attempt }),
        ...(durationMs === undefined ? {} : { durationMs }),
        domainEventId: job.domainEventId,
        ...(errorCode === undefined ? {} : { errorCode }),
        eventType: job.eventType,
        name,
        occurredAt: occurredAt.toISOString(),
        outboxMessageId: job.outboxMessageId,
        schemaVersion: 1,
      }),
    );
  }
}

export class OutboxHealthService {
  public constructor(private readonly transactions: TransactionManager) {}

  public read(
    scope: UserScope,
    deadLetterLimit = 20,
  ): Promise<OutboxHealthSnapshot> {
    return this.transactions.run(scope, (ports) =>
      ports.outbox.health(scope, deadLetterLimit),
    );
  }
}
