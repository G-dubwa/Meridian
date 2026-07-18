import {
  OUTBOX_DEAD_LETTER_QUEUE_V1,
  OUTBOX_QUEUE_V1,
  OUTBOX_RETRY_LIMIT,
} from '@meridian/application';
import type { ReliableEventService } from '@meridian/application';
import {
  outboxJobV1Schema,
  workerErrorCodeV1Schema,
  workerObservationV1Schema,
} from '@meridian/domain';
import type {
  OutboxJobV1,
  UserScope,
  WorkerObservationSink,
} from '@meridian/domain';
import type { JobResult, PgBoss } from 'pg-boss';

const DISPATCH_INTERVAL_MS = 500;

export class JsonWorkerObservationSink implements WorkerObservationSink {
  public observe(
    observation: Parameters<WorkerObservationSink['observe']>[0],
  ): void {
    process.stdout.write(`${JSON.stringify(observation)}\n`);
  }
}

export interface MeridianWorkerDependencies {
  readonly boss: PgBoss;
  readonly events: ReliableEventService;
  readonly scope: UserScope;
  readonly closeDatabase: () => Promise<void>;
  readonly observations: WorkerObservationSink;
}

export async function ensureWorkerQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(OUTBOX_DEAD_LETTER_QUEUE_V1, {
    deleteAfterSeconds: 30 * 24 * 60 * 60,
    retentionSeconds: 30 * 24 * 60 * 60,
  });
  await boss.createQueue(OUTBOX_QUEUE_V1, {
    deadLetter: OUTBOX_DEAD_LETTER_QUEUE_V1,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
    expireInSeconds: 60,
    retryBackoff: true,
    retryDelay: 1,
    retryDelayMax: 60,
    retryLimit: OUTBOX_RETRY_LIMIT,
  });
}

function resultFor(
  jobId: string,
  outcome: Awaited<ReturnType<ReliableEventService['process']>>,
): JobResult {
  if (outcome.state === 'succeeded') return { id: jobId, status: 'completed' };
  return {
    id: jobId,
    output: { errorCode: outcome.errorCode },
    status: outcome.state === 'retry' ? 'failed' : 'deadletter',
  };
}

export class MeridianWorkerRuntime {
  private dispatchTimer: ReturnType<typeof setInterval> | undefined;
  private stopping = false;
  private readonly observeQueueError = () => {
    this.observeWorkerError('QUEUE_RUNTIME_ERROR');
  };
  private readonly observeQueueWarning = () => {
    this.observeWorkerError('QUEUE_RUNTIME_WARNING');
  };

  public constructor(
    private readonly dependencies: MeridianWorkerDependencies,
  ) {}

  public async start(): Promise<void> {
    this.dependencies.boss.on('error', this.observeQueueError);
    this.dependencies.boss.on('warning', this.observeQueueWarning);
    await this.dependencies.boss.start();
    await ensureWorkerQueues(this.dependencies.boss);
    const workOptions = {
      batchSize: 10,
      includeMetadata: true,
      localConcurrency: 1,
      perJobResults: true,
      pollingIntervalSeconds: 0.5,
    } as const;
    await this.dependencies.boss.work<
      OutboxJobV1,
      JobResult[],
      typeof workOptions
    >(OUTBOX_QUEUE_V1, workOptions, async (jobs) =>
      Promise.all(
        jobs.map(async (job) => {
          const parsed = outboxJobV1Schema.parse(job.data);
          const outcome = await this.dependencies.events.process(
            parsed,
            job.retryCount + 1,
            job.retryLimit + 1,
          );
          return resultFor(job.id, outcome);
        }),
      ),
    );
    await this.dispatchNow();
    this.dispatchTimer = setInterval(() => {
      void this.dispatchNow().catch(() => {
        this.observeWorkerError('DISPATCH_LOOP_FAILURE');
      });
    }, DISPATCH_INTERVAL_MS);
  }

  public dispatchNow(): Promise<readonly OutboxJobV1[]> {
    if (this.stopping) return Promise.resolve([]);
    return this.dependencies.events.dispatchAvailable(this.dependencies.scope);
  }

  public async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    try {
      await this.dependencies.boss.stop({ graceful: true, timeout: 10_000 });
    } finally {
      this.dependencies.boss.off('error', this.observeQueueError);
      this.dependencies.boss.off('warning', this.observeQueueWarning);
      await this.dependencies.closeDatabase();
    }
  }

  private observeWorkerError(errorCode: string): void {
    this.dependencies.observations.observe(
      workerObservationV1Schema.parse({
        errorCode: workerErrorCodeV1Schema.parse(errorCode),
        name: 'worker.error',
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
      }),
    );
  }
}
