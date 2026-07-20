import { createHash, randomUUID } from 'node:crypto';
import {
  MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
  MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  MicrosoftTodoGatewayError,
  reminderIdV1Schema,
  reminderOccurrenceIdV1Schema,
  resourceIdV1Schema,
  userIdV1Schema,
  uuidV1Schema,
} from '../../packages/domain/src/index.js';
import type {
  ExternalWriteOperationRecord,
  IntegrationAccountRecord,
  MicrosoftTodoGateway,
  MicrosoftTodoListBindingRecord,
  MicrosoftTodoTaskBindingRecord,
  ReminderOccurrenceRecord,
  ReminderRecord,
  TransactionManager,
  TransactionPorts,
} from '../../packages/domain/src/index.js';
import { MicrosoftTodoSpikeService } from '../../packages/application/src/microsoft-todo-spike.js';
import { describe, expect, it } from 'vitest';

const scope = {
  userId: userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01970'),
};
const occurrenceId = reminderOccurrenceIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f01971',
);
const now = new Date('2026-07-21T08:00:00.000Z');

function account(todoPermission: boolean): IntegrationAccountRecord {
  return {
    accessTokenCiphertext: 'v1.synthetic',
    connectedAt: now,
    createdAt: now,
    disconnectedAt: null,
    displayName: 'Synthetic owner',
    graphPermissions: todoPermission
      ? MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS
      : MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
    id: uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01972'),
    lastRefreshedAt: null,
    provider: 'microsoft',
    providerSubjectId: 'synthetic-subject',
    refreshTokenCiphertext: 'v1.synthetic',
    requestedScopes: todoPermission
      ? MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES
      : MICROSOFT_STAGE_A_REQUESTED_SCOPES,
    scope,
    status: 'connected',
    tokenExpiresAt: new Date('2026-07-21T09:00:00.000Z'),
    tokenKeyVersion: 1,
    updatedAt: now,
  };
}

function harness(todoPermission = true) {
  let currentAccount = account(todoPermission);
  let listBinding: MicrosoftTodoListBindingRecord | null = null;
  let taskBinding: MicrosoftTodoTaskBindingRecord | null = null;
  let occurrence: ReminderOccurrenceRecord = {
    createdAt: now,
    id: occurrenceId,
    reminderId: reminderIdV1Schema.parse(
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01973',
    ),
    scheduledFor: new Date('2026-07-21T08:30:00.000Z'),
    scope,
    state: 'pending',
    updatedAt: now,
  };
  let reminder: ReminderRecord = {
    createdAt: now,
    creationAuthority: 'explicit_command',
    deliveryPolicy: 'undecided',
    expiresAt: null,
    id: occurrence.reminderId,
    ownerFeedback: null,
    priority: 'normal',
    purpose: 'Meridian WP-11 TEST — safe to delete',
    quietHoursBehavior: 'defer',
    recurrence: null,
    relatedResourceId: null,
    resourceId: resourceIdV1Schema.parse(occurrence.reminderId),
    scope,
    sourceProposalId: null,
    state: 'scheduled',
    timeZone: 'Africa/Johannesburg',
    triggerAt: occurrence.scheduledFor,
    updatedAt: now,
    version: 1,
  };
  const operations = new Map<string, ExternalWriteOperationRecord>();
  const activityEventTypes: string[] = [];
  const ports = {
    domainEvents: {
      append: (event: { readonly eventType: string }) => {
        activityEventTypes.push(event.eventType);
        return Promise.resolve();
      },
    },
    externalWriteOperations: {
      findByCorrelation: (
        _scope: typeof scope,
        correlationId: string,
        operation: ExternalWriteOperationRecord['operation'],
      ) =>
        Promise.resolve(
          [...operations.values()].find(
            (record) =>
              record.correlationId === correlationId &&
              record.operation === operation,
          ) ?? null,
        ),
      findById: (_scope: typeof scope, id: string) =>
        Promise.resolve(operations.get(id) ?? null),
      save: (record: ExternalWriteOperationRecord) => {
        operations.set(record.id, record);
        return Promise.resolve();
      },
    },
    integrationAccounts: {
      findMicrosoft: () => Promise.resolve(currentAccount),
      save: (record: IntegrationAccountRecord) => {
        currentAccount = record;
        return Promise.resolve();
      },
    },
    microsoftTodoListBindings: {
      find: () => Promise.resolve(listBinding),
      save: (record: MicrosoftTodoListBindingRecord) => {
        listBinding = record;
        return Promise.resolve();
      },
    },
    microsoftTodoTaskBindings: {
      findByOccurrence: () => Promise.resolve(taskBinding),
      findLatest: () => Promise.resolve(taskBinding),
      save: (record: MicrosoftTodoTaskBindingRecord) => {
        taskBinding = record;
        return Promise.resolve();
      },
    },
    outbox: { append: () => Promise.resolve() },
    reminderOccurrences: {
      findById: () => Promise.resolve(occurrence),
      save: (record: ReminderOccurrenceRecord) => {
        occurrence = record;
        return Promise.resolve();
      },
    },
    reminders: {
      findById: () => Promise.resolve(reminder),
      update: (record: ReminderRecord, expectedVersion: number) => {
        if (reminder.version !== expectedVersion) return Promise.resolve(false);
        reminder = record;
        return Promise.resolve(true);
      },
    },
  } as unknown as TransactionPorts;
  const transactions: TransactionManager = {
    run: (_scope, operation) => operation(ports),
  };
  return {
    activityEventTypes,
    current: () => ({ listBinding, occurrence, reminder, taskBinding }),
    operations,
    setAccount: (value: IntegrationAccountRecord) => {
      currentAccount = value;
    },
    transactions,
  };
}

describe('WP-11 Microsoft To Do spike orchestration', () => {
  it('recovers uncertain list and task creates without a duplicate POST', async () => {
    const state = harness();
    let listReads = 0;
    let taskCreates = 0;
    const ownershipMarker = uuidV1Schema.parse(
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01975',
    );
    const gateway: MicrosoftTodoGateway = {
      addListOwnershipMarker: (_token, listId, marker) =>
        Promise.resolve({
          displayName: 'Meridian',
          id: listId,
          isOwner: true,
          isShared: false,
          ownershipMarker: marker,
          wellknownListName: 'none',
        }),
      createList: () => Promise.reject(new Error('must not fall back blindly')),
      createListAtomically: () =>
        Promise.reject(new MicrosoftTodoGatewayError('uncertain_outcome')),
      createTask: () => {
        taskCreates += 1;
        return Promise.reject(
          new MicrosoftTodoGatewayError('uncertain_outcome'),
        );
      },
      deleteTask: () => Promise.resolve(),
      deleteList: () => Promise.resolve(),
      findTasksByOwnershipMarker: () =>
        Promise.resolve([{ etag: 'etag-1', id: 'managed-task' }]),
      getList: (_token, listId) =>
        Promise.resolve({
          displayName: 'Meridian',
          id: listId,
          isOwner: true,
          isShared: false,
          ownershipMarker,
          wellknownListName: 'none',
        }),
      getTask: () =>
        Promise.resolve({
          etag: null,
          id: 'managed-task',
          ownershipMarker,
          status: 'notStarted',
        }),
      listLists: () => {
        listReads += 1;
        return Promise.resolve(
          listReads === 1
            ? []
            : [
                {
                  displayName: 'Meridian',
                  id: 'recovered-list',
                  isOwner: true,
                  isShared: false,
                  ownershipMarker: null,
                  wellknownListName: 'none' as const,
                },
              ],
        );
      },
      listTasks: () => Promise.resolve([]),
      updateTask: () => Promise.resolve({ etag: null }),
    };
    const ids = [
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01974',
      ownershipMarker,
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01977',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01978',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01979',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01983',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01984',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01985',
      '018f0f77-34f1-7ef2-8ca1-7a3bf7f01986',
    ].map((id) => uuidV1Schema.parse(id));
    const service = new MicrosoftTodoSpikeService({
      accessTokenFor: () => Promise.resolve('synthetic-access-token'),
      clock: { now: () => now },
      gateway,
      ids: {
        next: () => {
          const id = ids.shift();
          if (!id) throw new Error('Synthetic ID fixture exhausted.');
          return id;
        },
      },
      projectionHasher: {
        hash: (value) => createHash('sha256').update(value).digest('hex'),
      },
      transactions: state.transactions,
    });

    const list = await service.prepareExperimentalList(scope, {
      correlationId: uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01980'),
      ownerConfirmed: true,
    });
    expect(list).toMatchObject({
      externalListId: 'recovered-list',
      ownershipMarker,
      status: 'experimental',
    });
    const task = await service.createExperimentalTask(
      scope,
      {
        dueAt: null,
        occurrenceId,
        recurrence: null,
        reminderAt: '2026-07-21T08:30:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Meridian WP-11 TEST — safe to delete',
      },
      {
        correlationId: uuidV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
        ),
        ownerConfirmed: true,
      },
    );
    expect(task.externalTaskId).toBe('managed-task');
    expect(taskCreates).toBe(1);
    expect(state.activityEventTypes).toEqual([
      'integration.microsoft_todo_list_prepared.v1',
      'delivery.microsoft_todo_task_created.v1',
    ]);
    expect(
      [...state.operations.values()].map((operation) => operation.state),
    ).toEqual(['succeeded', 'succeeded']);
  });

  it('refuses the existing five-scope connection before token or Graph access', async () => {
    const state = harness(false);
    let tokenRequests = 0;
    const service = new MicrosoftTodoSpikeService({
      accessTokenFor: () => {
        tokenRequests += 1;
        return Promise.resolve('must-not-be-used');
      },
      clock: { now: () => now },
      gateway: {} as MicrosoftTodoGateway,
      ids: { next: () => uuidV1Schema.parse(randomUUID()) },
      projectionHasher: { hash: () => '0'.repeat(64) },
      transactions: state.transactions,
    });
    await expect(
      service.prepareExperimentalList(scope, {
        correlationId: uuidV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01982',
        ),
        ownerConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_UNAVAILABLE' });
    expect(tokenRequests).toBe(0);
  });

  it('reads completion only from the bound marker and cleans only an otherwise empty managed list', async () => {
    const state = harness();
    let currentTime = now;
    let taskDeleted = 0;
    let listDeleted = 0;
    const listMarker = uuidV1Schema.parse(randomUUID());
    const taskMarker = uuidV1Schema.parse(randomUUID());
    const gateway: MicrosoftTodoGateway = {
      addListOwnershipMarker: () => Promise.reject(new Error('not expected')),
      createList: () => Promise.reject(new Error('not expected')),
      createListAtomically: () =>
        Promise.resolve({
          displayName: 'Meridian',
          id: 'managed-list',
          isOwner: true,
          isShared: false,
          ownershipMarker: listMarker,
          wellknownListName: 'none',
        }),
      createTask: () =>
        Promise.resolve({ etag: 'created-etag', id: 'managed-task' }),
      deleteList: () => {
        listDeleted += 1;
        return Promise.resolve();
      },
      deleteTask: () => {
        taskDeleted += 1;
        return Promise.resolve();
      },
      findTasksByOwnershipMarker: () => Promise.resolve([]),
      getList: () =>
        Promise.resolve({
          displayName: 'Meridian',
          id: 'managed-list',
          isOwner: true,
          isShared: false,
          ownershipMarker: listMarker,
          wellknownListName: 'none',
        }),
      getTask: () =>
        Promise.resolve({
          etag: 'completed-etag',
          id: 'managed-task',
          ownershipMarker: taskMarker,
          status: 'completed',
        }),
      listLists: () => Promise.resolve([]),
      listTasks: () =>
        Promise.resolve([
          {
            etag: 'completed-etag',
            id: 'managed-task',
            ownershipMarker: taskMarker,
            status: 'completed',
          },
        ]),
      updateTask: () => Promise.resolve({ etag: null }),
    };
    const generated = [
      randomUUID(),
      listMarker,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      taskMarker,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ].map((id) => uuidV1Schema.parse(id));
    const service = new MicrosoftTodoSpikeService({
      accessTokenFor: () => Promise.resolve('synthetic-access-token'),
      clock: { now: () => currentTime },
      gateway,
      ids: {
        next: () => {
          const value = generated.shift();
          return value ?? uuidV1Schema.parse(randomUUID());
        },
      },
      projectionHasher: { hash: () => '0'.repeat(64) },
      transactions: state.transactions,
    });
    await service.prepareExperimentalList(scope, {
      correlationId: uuidV1Schema.parse(randomUUID()),
      ownerConfirmed: true,
    });
    await service.createExperimentalTask(
      scope,
      {
        dueAt: null,
        occurrenceId,
        recurrence: null,
        reminderAt: '2026-07-21T08:30:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Meridian WP-11 TEST — safe to delete',
      },
      {
        correlationId: uuidV1Schema.parse(randomUUID()),
        ownerConfirmed: true,
      },
    );
    currentTime = new Date('2026-07-21T08:31:00.000Z');
    await service.reconcileExperimentalTask(scope, {
      correlationId: uuidV1Schema.parse(randomUUID()),
      ownerConfirmed: true,
    });
    expect(state.current()).toMatchObject({
      occurrence: { state: 'acknowledged' },
      reminder: { state: 'completed' },
      taskBinding: { status: 'completed' },
    });
    await service.cleanupExperimentalObjects(scope, {
      correlationId: uuidV1Schema.parse(randomUUID()),
      ownerConfirmed: true,
    });
    expect(taskDeleted).toBe(1);
    expect(listDeleted).toBe(1);
    expect(state.current()).toMatchObject({
      listBinding: { status: 'cleaned' },
      taskBinding: { status: 'cleaned' },
    });
    expect(state.activityEventTypes).toEqual([
      'integration.microsoft_todo_list_prepared.v1',
      'delivery.microsoft_todo_task_created.v1',
      'delivery.microsoft_todo_completion_observed.v1',
      'integration.microsoft_todo_cleanup_completed.v1',
    ]);
  });
});
