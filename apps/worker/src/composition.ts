import {
  FoundationEventConsumer,
  OUTBOX_QUEUE_V1,
  ReliableEventService,
} from '@meridian/application';
import {
  DrizzlePgBossOutboxDispatchGateway,
  DrizzleWorkerOutboxRepository,
  createDatabaseClient,
  findOwnerWorkerScope,
} from '@meridian/infrastructure-db';
import { PgBoss } from 'pg-boss';
import { JsonWorkerObservationSink, MeridianWorkerRuntime } from './runtime.js';

export async function createMeridianWorkerRuntime(): Promise<MeridianWorkerRuntime> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const database = createDatabaseClient(connectionString);
  const scope = await findOwnerWorkerScope(database.database);
  if (!scope) {
    await database.sql.end();
    throw new Error('Owner bootstrap is required before starting the worker.');
  }
  const boss = new PgBoss({
    application_name: 'meridian-worker',
    connectionString,
  });
  const observations = new JsonWorkerObservationSink();
  const events = new ReliableEventService({
    clock: { now: () => new Date() },
    consumer: new FoundationEventConsumer(),
    dispatcher: new DrizzlePgBossOutboxDispatchGateway(
      database.sql,
      boss,
      OUTBOX_QUEUE_V1,
    ),
    observations,
    outbox: new DrizzleWorkerOutboxRepository(database.database),
  });
  return new MeridianWorkerRuntime({
    boss,
    closeDatabase: () => database.sql.end(),
    events,
    observations,
    scope,
  });
}
