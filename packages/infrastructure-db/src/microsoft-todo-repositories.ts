import {
  externalWriteOperationIdV1Schema,
  externalWriteOperationRecordV1Schema,
  microsoftTodoListBindingRecordV1Schema,
  microsoftTodoListBindingIdV1Schema,
  microsoftTodoTaskBindingRecordV1Schema,
  reminderOccurrenceIdV1Schema,
} from '@meridian/domain';
import type {
  ExternalWriteOperationRecord,
  ExternalWriteOperationRepository,
  ExternalWriteOperationId,
  MicrosoftTodoListBindingRecord,
  MicrosoftTodoListBindingRepository,
  MicrosoftTodoTaskBindingRecord,
  MicrosoftTodoTaskBindingRepository,
  ReminderOccurrenceId,
  UserScope,
} from '@meridian/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import {
  externalWriteOperations,
  microsoftTodoListBindings,
  microsoftTodoTaskBindings,
} from './schema.js';

export class DrizzleMicrosoftTodoListBindingRepository implements MicrosoftTodoListBindingRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async find(
    scope: UserScope,
  ): Promise<MicrosoftTodoListBindingRecord | null> {
    const [row] = await this.database
      .select()
      .from(microsoftTodoListBindings)
      .where(eq(microsoftTodoListBindings.userId, scope.userId))
      .limit(1);
    return row
      ? microsoftTodoListBindingRecordV1Schema.parse({
          createdAt: row.createdAt,
          deltaLinkCiphertext: row.deltaLinkCiphertext,
          extensionVerifiedAt: row.extensionVerifiedAt,
          externalListId: row.externalListId,
          id: row.id,
          integrationAccountId: row.integrationAccountId,
          lastVerifiedAt: row.lastVerifiedAt,
          ownershipMarker: row.ownershipMarker,
          scope,
          status: row.status,
          updatedAt: row.updatedAt,
          version: row.version,
        })
      : null;
  }

  public async save(record: MicrosoftTodoListBindingRecord): Promise<void> {
    const parsed = microsoftTodoListBindingRecordV1Schema.parse(record);
    await this.database
      .insert(microsoftTodoListBindings)
      .values({
        createdAt: parsed.createdAt,
        deltaLinkCiphertext: parsed.deltaLinkCiphertext,
        displayName: 'Meridian',
        extensionVerifiedAt: parsed.extensionVerifiedAt,
        externalListId: parsed.externalListId,
        id: parsed.id,
        integrationAccountId: parsed.integrationAccountId,
        lastVerifiedAt: parsed.lastVerifiedAt,
        ownershipMarker: parsed.ownershipMarker,
        status: parsed.status,
        updatedAt: parsed.updatedAt,
        userId: parsed.scope.userId,
        version: parsed.version,
      })
      .onConflictDoUpdate({
        target: microsoftTodoListBindings.userId,
        set: {
          deltaLinkCiphertext: parsed.deltaLinkCiphertext,
          extensionVerifiedAt: parsed.extensionVerifiedAt,
          externalListId: parsed.externalListId,
          integrationAccountId: parsed.integrationAccountId,
          lastVerifiedAt: parsed.lastVerifiedAt,
          ownershipMarker: parsed.ownershipMarker,
          status: parsed.status,
          updatedAt: parsed.updatedAt,
          version: parsed.version,
        },
      });
  }
}

export class DrizzleMicrosoftTodoTaskBindingRepository implements MicrosoftTodoTaskBindingRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findByOccurrence(
    scope: UserScope,
    occurrenceId: ReminderOccurrenceId,
  ): Promise<MicrosoftTodoTaskBindingRecord | null> {
    const [row] = await this.database
      .select()
      .from(microsoftTodoTaskBindings)
      .where(
        and(
          eq(microsoftTodoTaskBindings.userId, scope.userId),
          eq(microsoftTodoTaskBindings.occurrenceId, occurrenceId),
        ),
      )
      .limit(1);
    return row
      ? microsoftTodoTaskBindingRecordV1Schema.parse({
          createdAt: row.createdAt,
          externalTaskId: row.externalTaskId,
          id: row.id,
          listBindingId: row.listBindingId,
          occurrenceId: row.occurrenceId,
          ownershipMarker: row.ownershipMarker,
          projectionHash: row.projectionHash,
          providerEtag: row.providerEtag,
          scope,
          status: row.status,
          updatedAt: row.updatedAt,
          version: row.version,
        })
      : null;
  }

  public async save(record: MicrosoftTodoTaskBindingRecord): Promise<void> {
    const parsed = microsoftTodoTaskBindingRecordV1Schema.parse(record);
    await this.database
      .insert(microsoftTodoTaskBindings)
      .values({
        createdAt: parsed.createdAt,
        externalTaskId: parsed.externalTaskId,
        id: parsed.id,
        listBindingId: parsed.listBindingId,
        occurrenceId: parsed.occurrenceId,
        ownershipMarker: parsed.ownershipMarker,
        projectionHash: parsed.projectionHash,
        providerEtag: parsed.providerEtag,
        status: parsed.status,
        updatedAt: parsed.updatedAt,
        userId: parsed.scope.userId,
        version: parsed.version,
      })
      .onConflictDoUpdate({
        target: microsoftTodoTaskBindings.occurrenceId,
        set: {
          externalTaskId: parsed.externalTaskId,
          listBindingId: parsed.listBindingId,
          ownershipMarker: parsed.ownershipMarker,
          projectionHash: parsed.projectionHash,
          providerEtag: parsed.providerEtag,
          status: parsed.status,
          updatedAt: parsed.updatedAt,
          version: parsed.version,
        },
      });
  }
}

export class DrizzleExternalWriteOperationRepository implements ExternalWriteOperationRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: ExternalWriteOperationId,
  ): Promise<ExternalWriteOperationRecord | null> {
    const [row] = await this.database
      .select()
      .from(externalWriteOperations)
      .where(
        and(
          eq(externalWriteOperations.userId, scope.userId),
          eq(externalWriteOperations.id, id),
        ),
      )
      .limit(1);
    return row
      ? externalWriteOperationRecordV1Schema.parse({
          attemptCount: row.attemptCount,
          baselineExternalIds: row.baselineExternalIds,
          correlationId: row.correlationId,
          createdAt: row.createdAt,
          desiredProjectionHash: row.desiredProjectionHash,
          failureClass: row.failureClass,
          id: externalWriteOperationIdV1Schema.parse(row.id),
          listBindingId:
            row.listBindingId === null
              ? null
              : microsoftTodoListBindingIdV1Schema.parse(row.listBindingId),
          occurrenceId:
            row.occurrenceId === null
              ? null
              : reminderOccurrenceIdV1Schema.parse(row.occurrenceId),
          operation: row.operation,
          ownershipMarker: row.ownershipMarker,
          scope,
          state: row.state,
          updatedAt: row.updatedAt,
        })
      : null;
  }

  public async save(record: ExternalWriteOperationRecord): Promise<void> {
    const parsed = externalWriteOperationRecordV1Schema.parse(record);
    await this.database
      .insert(externalWriteOperations)
      .values({
        attemptCount: parsed.attemptCount,
        baselineExternalIds: [...parsed.baselineExternalIds],
        correlationId: parsed.correlationId,
        createdAt: parsed.createdAt,
        desiredProjectionHash: parsed.desiredProjectionHash,
        failureClass: parsed.failureClass,
        id: parsed.id,
        listBindingId: parsed.listBindingId,
        occurrenceId: parsed.occurrenceId,
        operation: parsed.operation,
        ownershipMarker: parsed.ownershipMarker,
        state: parsed.state,
        updatedAt: parsed.updatedAt,
        userId: parsed.scope.userId,
      })
      .onConflictDoUpdate({
        target: externalWriteOperations.id,
        set: {
          attemptCount: parsed.attemptCount,
          baselineExternalIds: [...parsed.baselineExternalIds],
          desiredProjectionHash: parsed.desiredProjectionHash,
          failureClass: parsed.failureClass,
          listBindingId: parsed.listBindingId,
          occurrenceId: parsed.occurrenceId,
          state: parsed.state,
          updatedAt: parsed.updatedAt,
        },
      });
  }
}
