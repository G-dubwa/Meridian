import type {
  DerivationLinkRecord,
  DerivationLinkRepository,
  DomainEventEnvelopeV1,
  DomainEventRepository,
  EntryRecord,
  EntryRepository,
  EntryRevisionRecord,
  EntryRevisionRepository,
  OutboxMessageRecord,
  OutboxRepository,
  ResourceRecord,
  ResourceRepository,
  UserRecord,
  UserRepository,
  UserScope,
} from '@meridian/domain';
import { domainEventEnvelopeV1Schema, userIdV1Schema } from '@meridian/domain';
import { and, eq } from 'drizzle-orm';
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
    return row
      ? {
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
        }
      : null;
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
    return row
      ? {
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
        }
      : null;
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
    return row
      ? {
          attempts: row.attempts,
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          event: domainEventEnvelopeV1Schema.parse(row.payload),
          id: row.id as OutboxMessageRecord['id'],
          processedAt: row.processedAt,
          status: row.status as OutboxMessageRecord['status'],
          topic: row.topic,
        }
      : null;
  }
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
