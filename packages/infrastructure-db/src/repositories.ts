import type {
  DerivationLinkRecord,
  DerivationLinkRepository,
  DomainEventEnvelopeV1,
  DomainEventRepository,
  EntryRecord,
  EntryRepository,
  EntryRevisionRecord,
  EntryRevisionRepository,
  OutboxHealthSnapshot,
  OutboxMessageRecord,
  OutboxRepository,
  ResourceRecord,
  ResourceRepository,
  UserRecord,
  UserRepository,
  UserScope,
} from '@meridian/domain';
import {
  domainEventEnvelopeV1Schema,
  userIdV1Schema,
  workerErrorCodeV1Schema,
} from '@meridian/domain';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import type { DatabaseClient } from './client.js';
import {
  derivationLinks,
  domainEvents,
  entries,
  entryRevisions,
  outboxMessages,
  resources,
  users,
} from './schema.js';

export type DatabaseTransaction = Parameters<
  Parameters<DatabaseClient['transaction']>[0]
>[0];
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction;

export class DrizzleUserRepository implements UserRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(id: UserRecord['id']): Promise<UserRecord | null> {
    const [row] = await this.database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row
      ? {
          ...row,
          id: userIdV1Schema.parse(row.id),
          settings: row.settings as Readonly<Record<string, unknown>>,
        }
      : null;
  }

  public async save(user: UserRecord): Promise<void> {
    await this.database
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          homeTimeZone: user.homeTimeZone,
          locale: user.locale,
          settings: user.settings,
          softActiveGoalLimit: user.softActiveGoalLimit,
          updatedAt: user.updatedAt,
        },
      });
  }
}

export class DrizzleResourceRepository implements ResourceRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: ResourceRecord['id'],
  ): Promise<ResourceRecord | null> {
    const [row] = await this.database
      .select()
      .from(resources)
      .where(and(eq(resources.userId, scope.userId), eq(resources.id, id)))
      .limit(1);
    return row
      ? {
          createdAt: row.createdAt,
          deletedAt: row.deletedAt,
          id: row.id as ResourceRecord['id'],
          resourceType: row.resourceType,
          scope,
        }
      : null;
  }

  public async save(resource: ResourceRecord): Promise<void> {
    await this.database.insert(resources).values({
      createdAt: resource.createdAt,
      deletedAt: resource.deletedAt,
      id: resource.id,
      resourceType: resource.resourceType,
      resourceTypeVersion: 1,
      userId: resource.scope.userId,
    });
  }
}

export class DrizzleEntryRepository implements EntryRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: EntryRecord['id'],
  ): Promise<EntryRecord | null> {
    const [row] = await this.database
      .select()
      .from(entries)
      .where(and(eq(entries.userId, scope.userId), eq(entries.id, id)))
      .limit(1);
    return row ? mapEntry(row, scope) : null;
  }

  public async list(scope: UserScope): Promise<readonly EntryRecord[]> {
    const rows = await this.database
      .select()
      .from(entries)
      .where(eq(entries.userId, scope.userId))
      .orderBy(desc(entries.updatedAt));
    return rows.map((row) => mapEntry(row, scope));
  }

  public async save(entry: EntryRecord): Promise<void> {
    if (String(entry.id) !== String(entry.resourceId)) {
      throw new Error('Entry id must equal its canonical resource id.');
    }
    await this.database
      .insert(entries)
      .values({
        attrs: entry.attrs,
        attrsSchemaKey: entry.attrsSchemaKey,
        attrsSchemaVersion: entry.attrsSchemaVersion,
        createdAt: entry.createdAt,
        currentRevisionId: entry.currentRevisionId,
        id: entry.id,
        sensitivity: entry.sensitivity,
        status: entry.status,
        updatedAt: entry.updatedAt,
        userId: entry.scope.userId,
        version: entry.version,
      })
      .onConflictDoUpdate({
        target: entries.id,
        set: {
          attrs: entry.attrs,
          attrsSchemaKey: entry.attrsSchemaKey,
          attrsSchemaVersion: entry.attrsSchemaVersion,
          currentRevisionId: entry.currentRevisionId,
          sensitivity: entry.sensitivity,
          status: entry.status,
          updatedAt: entry.updatedAt,
          version: entry.version,
        },
      });
  }

  public async update(
    entry: EntryRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(entries)
      .set({
        attrs: entry.attrs,
        attrsSchemaKey: entry.attrsSchemaKey,
        attrsSchemaVersion: entry.attrsSchemaVersion,
        currentRevisionId: entry.currentRevisionId,
        sensitivity: entry.sensitivity,
        status: entry.status,
        updatedAt: entry.updatedAt,
        version: entry.version,
      })
      .where(
        and(
          eq(entries.id, entry.id),
          eq(entries.userId, entry.scope.userId),
          eq(entries.version, expectedVersion),
        ),
      )
      .returning({ id: entries.id });
    return rows.length === 1;
  }
}

function mapEntry(
  row: typeof entries.$inferSelect,
  scope: UserScope,
): EntryRecord {
  return {
    attrs: row.attrs as Readonly<Record<string, unknown>>,
    attrsSchemaKey: row.attrsSchemaKey,
    attrsSchemaVersion: row.attrsSchemaVersion,
    createdAt: row.createdAt,
    currentRevisionId:
      row.currentRevisionId as EntryRecord['currentRevisionId'],
    id: row.id as EntryRecord['id'],
    resourceId: row.id as EntryRecord['resourceId'],
    scope,
    sensitivity: row.sensitivity as EntryRecord['sensitivity'],
    status: row.status as EntryRecord['status'],
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleEntryRevisionRepository implements EntryRevisionRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: EntryRevisionRecord['id'],
  ): Promise<EntryRevisionRecord | null> {
    const [row] = await this.database
      .select()
      .from(entryRevisions)
      .where(
        and(eq(entryRevisions.userId, scope.userId), eq(entryRevisions.id, id)),
      )
      .limit(1);
    return row ? mapEntryRevision(row, scope) : null;
  }

  public async append(revision: EntryRevisionRecord): Promise<void> {
    await this.database.insert(entryRevisions).values({
      bodyMarkdown: revision.bodyMarkdown,
      bodyRaw: revision.bodyRaw,
      changeKind: revision.changeKind,
      contentHash: revision.contentHash,
      createdAt: revision.createdAt,
      createdBy: revision.createdBy,
      entryId: revision.entryId,
      id: revision.id,
      occurredAt: revision.occurredAt,
      processingClass: revision.processingClass,
      revisionNumber: revision.revisionNumber,
      userId: revision.scope.userId,
    });
  }

  public async listForEntry(
    scope: UserScope,
    entryId: EntryRevisionRecord['entryId'],
  ): Promise<readonly EntryRevisionRecord[]> {
    const rows = await this.database
      .select()
      .from(entryRevisions)
      .where(
        and(
          eq(entryRevisions.userId, scope.userId),
          eq(entryRevisions.entryId, entryId),
        ),
      )
      .orderBy(asc(entryRevisions.revisionNumber));
    return rows.map((row) => mapEntryRevision(row, scope));
  }

  public async findCurrentForAiProcessing(
    scope: UserScope,
    limit: number,
  ): Promise<readonly EntryRevisionRecord[]> {
    const rows = await this.database
      .select({ revision: entryRevisions })
      .from(entryRevisions)
      .innerJoin(
        entries,
        and(
          eq(entries.userId, entryRevisions.userId),
          eq(entries.currentRevisionId, entryRevisions.id),
        ),
      )
      .where(
        and(
          eq(entryRevisions.userId, scope.userId),
          eq(entryRevisions.processingClass, 'standard'),
          eq(entries.status, 'active'),
        ),
      )
      .orderBy(asc(entryRevisions.createdAt))
      .limit(limit);
    return rows.map((row) => mapEntryRevision(row.revision, scope));
  }
}

function mapEntryRevision(
  row: typeof entryRevisions.$inferSelect,
  scope: UserScope,
): EntryRevisionRecord {
  return {
    bodyMarkdown: row.bodyMarkdown,
    bodyRaw: row.bodyRaw,
    changeKind: row.changeKind as EntryRevisionRecord['changeKind'],
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    createdBy: row.createdBy as EntryRevisionRecord['createdBy'],
    entryId: row.entryId as EntryRevisionRecord['entryId'],
    id: row.id as EntryRevisionRecord['id'],
    occurredAt: row.occurredAt,
    processingClass:
      row.processingClass as EntryRevisionRecord['processingClass'],
    revisionNumber: row.revisionNumber,
    scope,
  };
}

export class DrizzleDomainEventRepository implements DomainEventRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async append(event: DomainEventEnvelopeV1): Promise<void> {
    await this.database.insert(domainEvents).values({
      aggregateId: event.aggregateId,
      causationId: event.causationId,
      correlationId: event.correlationId,
      eventType: event.eventType,
      id: event.eventId,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload,
      payloadSchemaVersion: event.schemaVersion,
      userId: event.scope.userId,
    });
  }

  public async acquireCommandLock(
    scope: UserScope,
    correlationId: DomainEventEnvelopeV1['correlationId'],
    eventType: string,
  ): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${scope.userId}:${eventType}:${correlationId}`}, 0))`,
    );
  }

  public async findByCorrelation(
    scope: UserScope,
    correlationId: DomainEventEnvelopeV1['correlationId'],
    eventType: string,
  ): Promise<DomainEventEnvelopeV1 | null> {
    const [row] = await this.database
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.userId, scope.userId),
          eq(domainEvents.correlationId, correlationId),
          eq(domainEvents.eventType, eventType),
        ),
      )
      .limit(1);
    return row ? mapDomainEvent(row, scope) : null;
  }

  public async listByTypePrefix(
    scope: UserScope,
    eventTypePrefix: string,
    limit: number,
  ): Promise<readonly DomainEventEnvelopeV1[]> {
    const rows = await this.database
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.userId, scope.userId),
          like(domainEvents.eventType, `${eventTypePrefix}%`),
        ),
      )
      .orderBy(desc(domainEvents.occurredAt))
      .limit(limit);
    return rows.map((row) => mapDomainEvent(row, scope));
  }
}

function mapDomainEvent(
  row: typeof domainEvents.$inferSelect,
  scope: UserScope,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: row.aggregateId ?? undefined,
    causationId: row.causationId ?? undefined,
    correlationId: row.correlationId,
    eventId: row.id,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    schemaVersion: row.payloadSchemaVersion,
    scope,
  });
}

export class DrizzleOutboxRepository implements OutboxRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async append(message: OutboxMessageRecord): Promise<void> {
    await this.database.insert(outboxMessages).values({
      attempts: message.attempts,
      availableAt: message.availableAt,
      createdAt: message.createdAt,
      domainEventId: message.event.eventId,
      id: message.id,
      deadLetteredAt: message.deadLetteredAt,
      lastErrorAt: message.lastErrorAt,
      lastErrorCode: message.lastErrorCode,
      payload: message.event,
      processedAt: message.processedAt,
      status: message.status,
      topic: message.topic,
      userId: message.event.scope.userId,
    });
  }

  public async findById(
    scope: UserScope,
    id: OutboxMessageRecord['id'],
  ): Promise<OutboxMessageRecord | null> {
    const [row] = await this.database
      .select()
      .from(outboxMessages)
      .where(
        and(eq(outboxMessages.userId, scope.userId), eq(outboxMessages.id, id)),
      )
      .limit(1);
    return row ? mapOutboxMessage(row) : null;
  }

  public async health(
    scope: UserScope,
    deadLetterLimit: number,
  ): Promise<OutboxHealthSnapshot> {
    const counts = await this.database
      .select({
        count: sql<number>`count(*)::integer`,
        status: outboxMessages.status,
      })
      .from(outboxMessages)
      .where(eq(outboxMessages.userId, scope.userId))
      .groupBy(outboxMessages.status);
    const [oldest] = await this.database
      .select({ oldest: outboxMessages.createdAt })
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.userId, scope.userId),
          sql`${outboxMessages.status} in ('pending', 'in_flight', 'uncertain')`,
        ),
      )
      .orderBy(asc(outboxMessages.createdAt))
      .limit(1);
    const deadLetters = await this.database
      .select()
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.userId, scope.userId),
          eq(outboxMessages.status, 'failed'),
        ),
      )
      .orderBy(desc(outboxMessages.deadLetteredAt))
      .limit(deadLetterLimit);
    const count = (status: OutboxMessageRecord['status']) =>
      counts.find((row) => row.status === status)?.count ?? 0;
    return {
      deadLetters: deadLetters.map((row) => {
        if (!row.deadLetteredAt)
          throw new Error('Failed outbox row lacks terminal metadata.');
        return {
          attempts: row.attempts,
          createdAt: row.createdAt,
          deadLetteredAt: row.deadLetteredAt,
          domainEventId: domainEventEnvelopeV1Schema.parse(row.payload).eventId,
          errorCode: workerErrorCodeV1Schema.parse(row.lastErrorCode),
          eventType: row.topic,
          outboxMessageId: row.id as OutboxMessageRecord['id'],
        };
      }),
      failed: count('failed'),
      inFlight: count('in_flight'),
      oldestUnfinishedAt: oldest?.oldest ?? null,
      pending: count('pending'),
      succeeded: count('succeeded'),
      uncertain: count('uncertain'),
    };
  }
}

export function mapOutboxMessage(
  row: typeof outboxMessages.$inferSelect,
): OutboxMessageRecord {
  return {
    attempts: row.attempts,
    availableAt: row.availableAt,
    createdAt: row.createdAt,
    deadLetteredAt: row.deadLetteredAt,
    event: domainEventEnvelopeV1Schema.parse(row.payload),
    id: row.id as OutboxMessageRecord['id'],
    lastErrorAt: row.lastErrorAt,
    lastErrorCode:
      row.lastErrorCode === null
        ? null
        : workerErrorCodeV1Schema.parse(row.lastErrorCode),
    processedAt: row.processedAt,
    status: row.status as OutboxMessageRecord['status'],
    topic: row.topic,
  };
}

export class DrizzleDerivationLinkRepository implements DerivationLinkRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async append(link: DerivationLinkRecord): Promise<void> {
    await this.database.insert(derivationLinks).values({
      assertionClass: link.assertionClass,
      confidence: link.confidence?.toString(),
      createdAt: link.createdAt,
      derivedResourceId: link.derivedResourceId,
      id: link.id,
      invalidatedAt: link.invalidatedAt,
      invalidationReason: link.invalidationReason,
      relation: link.relation,
      sourceResourceId: link.sourceResourceId,
      sourceRevisionId: link.sourceRevisionId,
      sourceSpanEnd: link.sourceSpanEnd,
      sourceSpanStart: link.sourceSpanStart,
      userId: link.scope.userId,
    });
  }

  public async findForDerivedResource(
    scope: UserScope,
    id: ResourceRecord['id'],
  ): Promise<readonly DerivationLinkRecord[]> {
    const rows = await this.database
      .select()
      .from(derivationLinks)
      .where(
        and(
          eq(derivationLinks.userId, scope.userId),
          eq(derivationLinks.derivedResourceId, id),
        ),
      );
    return rows.map((row) => ({
      assertionClass: row.assertionClass,
      confidence: row.confidence === null ? null : Number(row.confidence),
      createdAt: row.createdAt,
      derivedResourceId:
        row.derivedResourceId as DerivationLinkRecord['derivedResourceId'],
      id: row.id as DerivationLinkRecord['id'],
      invalidatedAt: row.invalidatedAt,
      invalidationReason: row.invalidationReason,
      relation: row.relation as DerivationLinkRecord['relation'],
      scope,
      sourceResourceId:
        row.sourceResourceId as DerivationLinkRecord['sourceResourceId'],
      sourceRevisionId:
        row.sourceRevisionId as DerivationLinkRecord['sourceRevisionId'],
      sourceSpanEnd: row.sourceSpanEnd,
      sourceSpanStart: row.sourceSpanStart,
    }));
  }
}
