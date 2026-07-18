import type {
  OutboxAttemptClaim,
  OutboxDispatchGateway,
  OutboxJobV1,
  UserScope,
  WorkerErrorCode,
  WorkerOutboxRepository,
} from '@meridian/domain';
import {
  domainEventEnvelopeV1Schema,
  outboxJobV1Schema,
  userIdV1Schema,
} from '@meridian/domain';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db, PgBoss } from 'pg-boss';
import type postgres from 'postgres';
import type { DatabaseClient, DatabaseSql } from './client.js';
import { mapOutboxMessage } from './repositories.js';
import { outboxMessages } from './schema.js';

async function setScope(
  transaction: Parameters<Parameters<DatabaseClient['transaction']>[0]>[0],
  scope: UserScope,
): Promise<void> {
  await transaction.execute(
    sql`select set_config('meridian.user_id', ${scope.userId}, true)`,
  );
}

interface DispatchRow {
  readonly id: string;
  readonly user_id: string;
  readonly payload: unknown;
}

function jobForDispatchRow(row: DispatchRow): OutboxJobV1 {
  const event = domainEventEnvelopeV1Schema.parse(row.payload);
  return outboxJobV1Schema.parse({
    domainEventId: event.eventId,
    eventType: event.eventType,
    outboxMessageId: row.id,
    schemaVersion: 1,
    userId: row.user_id,
  });
}

function pgBossTransactionDatabase(transaction: postgres.TransactionSql): Db {
  return {
    executeSql: async (text, values = []) => {
      const rows = await transaction.unsafe(text, values as never[]);
      return { rows: Array.from(rows) };
    },
  };
}

function scopeFor(job: OutboxJobV1): UserScope {
  return { userId: userIdV1Schema.parse(job.userId) };
}

function rowMatchesJob(
  row: typeof outboxMessages.$inferSelect,
  job: OutboxJobV1,
): boolean {
  const event = domainEventEnvelopeV1Schema.parse(row.payload);
  return (
    row.id === job.outboxMessageId &&
    row.userId === job.userId &&
    event.eventId === job.domainEventId &&
    event.eventType === job.eventType
  );
}

export class DrizzlePgBossOutboxDispatchGateway implements OutboxDispatchGateway {
  public constructor(
    private readonly database: DatabaseSql,
    private readonly boss: PgBoss,
    private readonly queueName: string,
  ) {}

  public dispatchAvailable(
    scope: UserScope,
    now: Date,
    limit: number,
  ): Promise<readonly OutboxJobV1[]> {
    return this.database.begin(async (transaction) => {
      await transaction`select set_config('meridian.user_id', ${scope.userId}, true)`;
      const rows = await transaction<DispatchRow[]>`
        select id, user_id, payload
        from outbox_messages
        where user_id = ${scope.userId}
          and status = 'pending'
          and available_at <= ${now.toISOString()}
        order by available_at, created_at
        limit ${limit}
        for update skip locked
      `;

      const jobs: OutboxJobV1[] = [];
      for (const row of rows) {
        const job = jobForDispatchRow(row);
        const jobId = await this.boss.send(this.queueName, job, {
          db: pgBossTransactionDatabase(transaction),
          id: job.outboxMessageId,
        });
        if (!jobId) continue;
        const updated = await transaction<{ id: string }[]>`
          update outbox_messages
          set status = 'in_flight'
          where id = ${row.id}
            and user_id = ${scope.userId}
            and status = 'pending'
          returning id
        `;
        if (updated.length === 1) jobs.push(job);
      }
      return jobs;
    });
  }
}

export class DrizzleWorkerOutboxRepository implements WorkerOutboxRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public claimAttempt(
    job: OutboxJobV1,
    attempt: number,
    startedAt: Date,
  ): Promise<OutboxAttemptClaim> {
    void startedAt;
    return this.database.transaction(async (transaction) => {
      const scope = scopeFor(job);
      await setScope(transaction, scope);
      const [row] = await transaction
        .select()
        .from(outboxMessages)
        .where(
          and(
            eq(outboxMessages.userId, scope.userId),
            eq(outboxMessages.id, job.outboxMessageId),
          ),
        )
        .limit(1)
        .for('update');
      if (!row || !rowMatchesJob(row, job)) return { state: 'missing' };
      if (row.status === 'succeeded') return { state: 'succeeded' };
      if (row.status === 'failed') return { state: 'dead_lettered' };
      if (row.status !== 'in_flight' || row.attempts >= attempt)
        return { state: 'duplicate' };
      const [claimed] = await transaction
        .update(outboxMessages)
        .set({ attempts: attempt })
        .where(
          and(
            eq(outboxMessages.id, job.outboxMessageId),
            eq(outboxMessages.userId, scope.userId),
            eq(outboxMessages.status, 'in_flight'),
            lt(outboxMessages.attempts, attempt),
          ),
        )
        .returning();
      return claimed
        ? { message: mapOutboxMessage(claimed), state: 'claimed' }
        : { state: 'duplicate' };
    });
  }

  public markSucceeded(
    job: OutboxJobV1,
    attempt: number,
    processedAt: Date,
  ): Promise<boolean> {
    return this.transition(job, attempt, {
      deadLetteredAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      processedAt,
      status: 'succeeded',
    });
  }

  public markFailed(
    job: OutboxJobV1,
    attempt: number,
    errorCode: WorkerErrorCode,
    failedAt: Date,
    terminal: boolean,
  ): Promise<boolean> {
    return this.transition(job, attempt, {
      deadLetteredAt: terminal ? failedAt : null,
      lastErrorAt: failedAt,
      lastErrorCode: errorCode,
      processedAt: null,
      status: terminal ? 'failed' : 'in_flight',
    });
  }

  private transition(
    job: OutboxJobV1,
    attempt: number,
    values: Pick<
      typeof outboxMessages.$inferInsert,
      | 'deadLetteredAt'
      | 'lastErrorAt'
      | 'lastErrorCode'
      | 'processedAt'
      | 'status'
    >,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const scope = scopeFor(job);
      await setScope(transaction, scope);
      const updated = await transaction
        .update(outboxMessages)
        .set(values)
        .where(
          and(
            eq(outboxMessages.id, job.outboxMessageId),
            eq(outboxMessages.userId, scope.userId),
            eq(outboxMessages.status, 'in_flight'),
            eq(outboxMessages.attempts, attempt),
          ),
        )
        .returning({ id: outboxMessages.id });
      return updated.length === 1;
    });
  }
}
