import { z } from 'zod';
import {
  externalWriteOperationIdV1Schema,
  microsoftTodoListBindingIdV1Schema,
  microsoftTodoTaskBindingIdV1Schema,
  reminderOccurrenceIdV1Schema,
  uuidV1Schema,
} from './ids.js';
import { userScopeV1Schema } from './scope.js';

export const MICROSOFT_TODO_LIST_NAME = 'Meridian' as const;
export const MICROSOFT_TODO_EXTENSION_NAME =
  'com.meridian.todoOwnership' as const;
export const MICROSOFT_TODO_TIME_ZONE = 'Africa/Johannesburg' as const;
export const MICROSOFT_TODO_GRAPH_TIME_ZONE =
  'South Africa Standard Time' as const;

export const microsoftTodoListStatusV1Schema = z.enum([
  'experimental',
  'suspended',
  'unmanaged',
  'cleaned',
]);
export type MicrosoftTodoListStatus = z.infer<
  typeof microsoftTodoListStatusV1Schema
>;

export const microsoftTodoTaskStatusV1Schema = z.enum([
  'pending',
  'completed',
  'deleted',
  'orphaned',
  'conflicted',
  'unmanaged',
  'cleaned',
]);
export type MicrosoftTodoTaskStatus = z.infer<
  typeof microsoftTodoTaskStatusV1Schema
>;

export const externalWriteKindV1Schema = z.enum([
  'create_list',
  'mark_list',
  'create_task',
  'update_task',
  'delete_task',
  'reconcile',
  'cleanup',
]);
export type ExternalWriteKind = z.infer<typeof externalWriteKindV1Schema>;

export const externalWriteStateV1Schema = z.enum([
  'pending',
  'uncertain',
  'succeeded',
  'failed',
]);
export type ExternalWriteState = z.infer<typeof externalWriteStateV1Schema>;

export const microsoftTodoFailureClassV1Schema = z.enum([
  'atomic_extension_unsupported',
  'authorization_revoked',
  'conflict',
  'containment_rejected',
  'not_found',
  'provider_unavailable',
  'rate_limited',
  'uncertain_outcome',
  'validation_failed',
]);
export type MicrosoftTodoFailureClass = z.infer<
  typeof microsoftTodoFailureClassV1Schema
>;

export const microsoftTodoActivityEventTypeV1Schema = z.enum([
  'integration.microsoft_todo_list_prepared.v1',
  'delivery.microsoft_todo_task_created.v1',
  'delivery.microsoft_todo_completion_observed.v1',
  'integration.microsoft_todo_cleanup_completed.v1',
  'integration.microsoft_todo_operation_failed.v1',
]);
export type MicrosoftTodoActivityEventType = z.infer<
  typeof microsoftTodoActivityEventTypeV1Schema
>;

export class MicrosoftTodoGatewayError extends Error {
  public constructor(public readonly failureClass: MicrosoftTodoFailureClass) {
    super(failureClass);
    this.name = 'MicrosoftTodoGatewayError';
  }
}

export const microsoftTodoListSnapshotV1Schema = z
  .object({
    id: z.string().min(1).max(1024),
    displayName: z.string().min(1).max(255),
    isOwner: z.boolean(),
    isShared: z.boolean(),
    wellknownListName: z.enum([
      'none',
      'defaultList',
      'flaggedEmails',
      'unknownFutureValue',
    ]),
    ownershipMarker: uuidV1Schema.nullable(),
  })
  .strict();
export type MicrosoftTodoListSnapshot = z.infer<
  typeof microsoftTodoListSnapshotV1Schema
>;

export const microsoftTodoTaskSnapshotV1Schema = z
  .object({
    id: z.string().min(1).max(1024),
    etag: z.string().max(2048).nullable(),
    status: z.enum([
      'notStarted',
      'inProgress',
      'completed',
      'waitingOnOthers',
      'deferred',
    ]),
    ownershipMarker: uuidV1Schema.nullable(),
  })
  .strict();
export type MicrosoftTodoTaskSnapshot = z.infer<
  typeof microsoftTodoTaskSnapshotV1Schema
>;

export const microsoftTodoProjectionV1Schema = z
  .object({
    title: z.string().min(1).max(240),
    reminderAt: z.iso.datetime({ offset: true }),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    timeZone: z.literal(MICROSOFT_TODO_TIME_ZONE),
    recurrence: z.null(),
    occurrenceId: reminderOccurrenceIdV1Schema,
  })
  .strict();
export type MicrosoftTodoProjection = z.infer<
  typeof microsoftTodoProjectionV1Schema
>;

export const microsoftTodoActivityPayloadV1Schema = z
  .object({
    listBindingId: microsoftTodoListBindingIdV1Schema.nullable(),
    operationId: externalWriteOperationIdV1Schema,
    occurrenceId: reminderOccurrenceIdV1Schema.nullable(),
    operation: externalWriteKindV1Schema,
    outcome: z.enum(['succeeded', 'failed', 'uncertain', 'suspended']),
    attemptCount: z.number().int().min(0).max(10),
    failureClass: microsoftTodoFailureClassV1Schema.nullable(),
  })
  .strict();

export function assertManagedMicrosoftTodoListV1(
  snapshot: MicrosoftTodoListSnapshot,
  expectedListId: string,
  expectedMarker: string,
): void {
  const parsed = microsoftTodoListSnapshotV1Schema.parse(snapshot);
  if (
    parsed.id !== expectedListId ||
    parsed.displayName !== MICROSOFT_TODO_LIST_NAME ||
    !parsed.isOwner ||
    parsed.isShared ||
    parsed.wellknownListName !== 'none' ||
    parsed.ownershipMarker !== expectedMarker
  )
    throw new MicrosoftTodoGatewayError('containment_rejected');
}

export const microsoftTodoListBindingRecordV1Schema = z
  .object({
    id: microsoftTodoListBindingIdV1Schema,
    scope: userScopeV1Schema,
    integrationAccountId: uuidV1Schema,
    externalListId: z.string().min(1).max(1024),
    ownershipMarker: uuidV1Schema,
    status: microsoftTodoListStatusV1Schema,
    extensionVerifiedAt: z.date(),
    lastVerifiedAt: z.date(),
    deltaLinkCiphertext: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    version: z.number().int().positive(),
  })
  .strict();
export type MicrosoftTodoListBindingRecord = z.infer<
  typeof microsoftTodoListBindingRecordV1Schema
>;

export const microsoftTodoTaskBindingRecordV1Schema = z
  .object({
    id: microsoftTodoTaskBindingIdV1Schema,
    scope: userScopeV1Schema,
    listBindingId: microsoftTodoListBindingIdV1Schema,
    occurrenceId: reminderOccurrenceIdV1Schema,
    externalTaskId: z.string().min(1).max(1024),
    ownershipMarker: uuidV1Schema,
    projectionHash: z.string().regex(/^[a-f0-9]{64}$/),
    providerEtag: z.string().max(2048).nullable(),
    status: microsoftTodoTaskStatusV1Schema,
    createdAt: z.date(),
    updatedAt: z.date(),
    version: z.number().int().positive(),
  })
  .strict();
export type MicrosoftTodoTaskBindingRecord = z.infer<
  typeof microsoftTodoTaskBindingRecordV1Schema
>;

export const externalWriteOperationRecordV1Schema = z
  .object({
    id: externalWriteOperationIdV1Schema,
    scope: userScopeV1Schema,
    listBindingId: microsoftTodoListBindingIdV1Schema.nullable(),
    occurrenceId: reminderOccurrenceIdV1Schema.nullable(),
    correlationId: uuidV1Schema,
    operation: externalWriteKindV1Schema,
    ownershipMarker: uuidV1Schema,
    desiredProjectionHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    baselineExternalIds: z.array(z.string().min(1).max(1024)).max(1000),
    state: externalWriteStateV1Schema,
    attemptCount: z.number().int().min(0).max(10),
    failureClass: microsoftTodoFailureClassV1Schema.nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type ExternalWriteOperationRecord = z.infer<
  typeof externalWriteOperationRecordV1Schema
>;
