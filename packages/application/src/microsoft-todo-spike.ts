import {
  ConflictError,
  IntegrationUnavailableError,
  MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  MicrosoftTodoGatewayError,
  assertManagedMicrosoftTodoListV1,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  externalWriteOperationIdV1Schema,
  microsoftTodoActivityPayloadV1Schema,
  microsoftTodoFailureClassV1Schema,
  microsoftTodoListBindingIdV1Schema,
  microsoftTodoProjectionV1Schema,
  microsoftTodoTaskBindingIdV1Schema,
  outboxMessageIdV1Schema,
  reminderOccurrenceIdV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  DomainEventEnvelopeV1,
  ExternalWriteOperationRecord,
  IdGenerator,
  MicrosoftTodoActivityEventType,
  MicrosoftTodoFailureClass,
  MicrosoftTodoGateway,
  MicrosoftTodoListBindingRecord,
  MicrosoftTodoListSnapshot,
  MicrosoftTodoProjection,
  MicrosoftTodoTaskBindingRecord,
  OutboxMessageRecord,
  SecretService,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface MicrosoftTodoSpikeDependencies {
  readonly accessTokenFor: (scope: UserScope) => Promise<string>;
  readonly clock: Clock;
  readonly gateway: MicrosoftTodoGateway;
  readonly ids: IdGenerator;
  readonly projectionHasher: Pick<SecretService, 'hash'>;
  readonly transactions: TransactionManager;
}

export interface MicrosoftTodoSpikeContext {
  readonly correlationId: Uuid;
  readonly ownerConfirmed: true;
}

function failureClass(error: unknown): MicrosoftTodoFailureClass {
  if (error instanceof MicrosoftTodoGatewayError) return error.failureClass;
  if (error && typeof error === 'object' && 'failureClass' in error) {
    const parsed = microsoftTodoFailureClassV1Schema.safeParse(
      error.failureClass,
    );
    if (parsed.success) return parsed.data;
  }
  return 'provider_unavailable';
}

function exactSet(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    values.length === expected.length &&
    expected.every((value) => values.includes(value))
  );
}

function recoverableList(
  beforeIds: ReadonlySet<string>,
  after: readonly MicrosoftTodoListSnapshot[],
): MicrosoftTodoListSnapshot | null {
  const candidates = after.filter(
    (list) =>
      !beforeIds.has(list.id) &&
      list.displayName === 'Meridian' &&
      list.isOwner &&
      !list.isShared &&
      list.wellknownListName === 'none',
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function assertUnmarkedOwnedList(list: MicrosoftTodoListSnapshot): void {
  if (
    list.displayName !== 'Meridian' ||
    !list.isOwner ||
    list.isShared ||
    list.wellknownListName !== 'none' ||
    list.ownershipMarker !== null
  )
    throw new MicrosoftTodoGatewayError('containment_rejected');
}

async function appendActivity(
  dependencies: MicrosoftTodoSpikeDependencies,
  ports: TransactionPorts,
  scope: UserScope,
  context: Pick<MicrosoftTodoSpikeContext, 'correlationId'>,
  eventType: MicrosoftTodoActivityEventType,
  operation: ExternalWriteOperationRecord,
): Promise<void> {
  const now = dependencies.clock.now();
  const event: DomainEventEnvelopeV1 = domainEventEnvelopeV1Schema.parse({
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: microsoftTodoActivityPayloadV1Schema.parse({
      attemptCount: operation.attemptCount,
      failureClass: operation.failureClass,
      listBindingId: operation.listBindingId,
      occurrenceId: operation.occurrenceId,
      operation: operation.operation,
      operationId: operation.id,
      outcome:
        operation.state === 'succeeded'
          ? 'succeeded'
          : operation.state === 'uncertain'
            ? 'uncertain'
            : 'failed',
    }),
    schemaVersion: 1,
    scope,
  });
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: now,
    createdAt: now,
    deadLetteredAt: null,
    event,
    id: outboxMessageIdV1Schema.parse(dependencies.ids.next()),
    lastErrorAt: null,
    lastErrorCode: null,
    processedAt: null,
    status: 'pending',
    topic: event.eventType,
  };
  await ports.domainEvents.append(event);
  await ports.outbox.append(outbox);
}

export class MicrosoftTodoSpikeService {
  public constructor(
    private readonly dependencies: MicrosoftTodoSpikeDependencies,
  ) {}

  public async prepareExperimentalList(
    scope: UserScope,
    context: MicrosoftTodoSpikeContext,
  ): Promise<MicrosoftTodoListBindingRecord> {
    await this.assertExperimentalAuthority(scope);
    const existing = await this.dependencies.transactions.run(scope, (ports) =>
      ports.microsoftTodoListBindings.find(scope),
    );
    if (existing) {
      if (existing.status === 'experimental') return existing;
      throw new IntegrationUnavailableError();
    }

    const accessToken = await this.dependencies.accessTokenFor(scope);
    const baseline = await this.dependencies.gateway.listLists(accessToken);
    const now = this.dependencies.clock.now();
    const operationId = externalWriteOperationIdV1Schema.parse(
      this.dependencies.ids.next(),
    );
    const ownershipMarker = uuidV1Schema.parse(this.dependencies.ids.next());
    const operation: ExternalWriteOperationRecord = {
      attemptCount: 0,
      baselineExternalIds: baseline.map((list) => list.id),
      correlationId: context.correlationId,
      createdAt: now,
      desiredProjectionHash: null,
      failureClass: null,
      id: operationId,
      listBindingId: null,
      occurrenceId: null,
      operation: 'create_list',
      ownershipMarker,
      scope,
      state: 'pending',
      updatedAt: now,
    };
    await this.dependencies.transactions.run(scope, (ports) =>
      ports.externalWriteOperations.save(operation),
    );

    let list: MicrosoftTodoListSnapshot;
    try {
      list = await this.createListWithRecovery(
        accessToken,
        ownershipMarker,
        operation,
      );
    } catch (error) {
      const classified = failureClass(error);
      await this.recordFailure(scope, operation, classified);
      throw new IntegrationUnavailableError();
    }

    assertManagedMicrosoftTodoListV1(list, list.id, ownershipMarker);
    const binding: MicrosoftTodoListBindingRecord = {
      createdAt: now,
      deltaLinkCiphertext: null,
      extensionVerifiedAt: now,
      externalListId: list.id,
      id: microsoftTodoListBindingIdV1Schema.parse(
        this.dependencies.ids.next(),
      ),
      integrationAccountId: await this.integrationAccountId(scope),
      lastVerifiedAt: now,
      ownershipMarker,
      scope,
      status: 'experimental',
      updatedAt: now,
      version: 1,
    };
    await this.dependencies.transactions.run(scope, async (ports) => {
      await ports.microsoftTodoListBindings.save(binding);
      const completedOperation: ExternalWriteOperationRecord = {
        ...operation,
        attemptCount: 1,
        listBindingId: binding.id,
        state: 'succeeded',
        updatedAt: now,
      };
      await ports.externalWriteOperations.save(completedOperation);
      await appendActivity(
        this.dependencies,
        ports,
        scope,
        context,
        'integration.microsoft_todo_list_prepared.v1',
        completedOperation,
      );
    });
    return binding;
  }

  private async createListWithRecovery(
    accessToken: string,
    ownershipMarker: Uuid,
    operation: ExternalWriteOperationRecord,
  ): Promise<MicrosoftTodoListSnapshot> {
    try {
      let list = await this.dependencies.gateway.createListAtomically(
        accessToken,
        ownershipMarker,
      );
      if (list.ownershipMarker === ownershipMarker) return list;
      const verified = await this.dependencies.gateway.getList(
        accessToken,
        list.id,
      );
      if (verified.ownershipMarker === ownershipMarker) return verified;
      assertUnmarkedOwnedList(verified);
      list = await this.dependencies.gateway.addListOwnershipMarker(
        accessToken,
        verified.id,
        ownershipMarker,
      );
      return list;
    } catch (error) {
      const classified = failureClass(error);
      if (classified === 'atomic_extension_unsupported') {
        const created = await this.dependencies.gateway.createList(
          accessToken,
          ownershipMarker,
        );
        assertUnmarkedOwnedList(created);
        return this.dependencies.gateway.addListOwnershipMarker(
          accessToken,
          created.id,
          ownershipMarker,
        );
      }
      if (classified !== 'uncertain_outcome') throw error;
      const after = await this.dependencies.gateway.listLists(accessToken);
      const recovered = recoverableList(
        new Set(operation.baselineExternalIds),
        after,
      );
      if (!recovered) throw new MicrosoftTodoGatewayError('uncertain_outcome');
      return this.dependencies.gateway.addListOwnershipMarker(
        accessToken,
        recovered.id,
        ownershipMarker,
      );
    }
  }

  public async createExperimentalTask(
    scope: UserScope,
    projectionInput: MicrosoftTodoProjection,
    context: MicrosoftTodoSpikeContext,
  ): Promise<MicrosoftTodoTaskBindingRecord> {
    await this.assertExperimentalAuthority(scope);
    const projection = microsoftTodoProjectionV1Schema.parse(projectionInput);
    const occurrenceId = reminderOccurrenceIdV1Schema.parse(
      projection.occurrenceId,
    );
    const state = await this.dependencies.transactions.run(
      scope,
      async (ports) => ({
        binding: await ports.microsoftTodoListBindings.find(scope),
        existing: await ports.microsoftTodoTaskBindings.findByOccurrence(
          scope,
          occurrenceId,
        ),
        occurrence: await ports.reminderOccurrences.findById(
          scope,
          occurrenceId,
        ),
      }),
    );
    if (state.existing) return state.existing;
    if (state.binding?.status !== 'experimental')
      throw new IntegrationUnavailableError();
    if (
      state.occurrence?.state !== 'pending' ||
      state.occurrence.scheduledFor.toISOString() !== projection.reminderAt
    )
      throw new ConflictError('Reminder occurrence does not match projection.');

    const accessToken = await this.dependencies.accessTokenFor(scope);
    const verifiedList = await this.dependencies.gateway.getList(
      accessToken,
      state.binding.externalListId,
    );
    assertManagedMicrosoftTodoListV1(
      verifiedList,
      state.binding.externalListId,
      state.binding.ownershipMarker,
    );
    const now = this.dependencies.clock.now();
    const operationId = externalWriteOperationIdV1Schema.parse(
      this.dependencies.ids.next(),
    );
    const ownershipMarker = uuidV1Schema.parse(this.dependencies.ids.next());
    const projectionHash = this.dependencies.projectionHasher.hash(
      JSON.stringify(projection),
    );
    const operation: ExternalWriteOperationRecord = {
      attemptCount: 0,
      baselineExternalIds: [],
      correlationId: context.correlationId,
      createdAt: now,
      desiredProjectionHash: projectionHash,
      failureClass: null,
      id: operationId,
      listBindingId: state.binding.id,
      occurrenceId,
      operation: 'create_task',
      ownershipMarker,
      scope,
      state: 'pending',
      updatedAt: now,
    };
    await this.dependencies.transactions.run(scope, (ports) =>
      ports.externalWriteOperations.save(operation),
    );

    let task: { readonly id: string; readonly etag: string | null };
    let attemptCount = 1;
    try {
      task = await this.dependencies.gateway.createTask(
        accessToken,
        state.binding.externalListId,
        projection,
        ownershipMarker,
      );
    } catch (error) {
      const classified = failureClass(error);
      if (classified !== 'uncertain_outcome') {
        await this.recordFailure(scope, operation, classified);
        throw new IntegrationUnavailableError();
      }
      let matches: readonly {
        readonly id: string;
        readonly etag: string | null;
      }[];
      try {
        matches = await this.dependencies.gateway.findTasksByOwnershipMarker(
          accessToken,
          state.binding.externalListId,
          ownershipMarker,
        );
      } catch (recoveryError) {
        await this.recordFailure(
          scope,
          { ...operation, attemptCount: 1 },
          failureClass(recoveryError),
        );
        throw new IntegrationUnavailableError();
      }
      const [match] = matches;
      if (matches.length === 1 && match) task = match;
      else if (matches.length === 0) {
        attemptCount = 2;
        try {
          task = await this.dependencies.gateway.createTask(
            accessToken,
            state.binding.externalListId,
            projection,
            ownershipMarker,
          );
        } catch (retryError) {
          await this.recordFailure(
            scope,
            { ...operation, attemptCount: 1 },
            failureClass(retryError),
          );
          throw new IntegrationUnavailableError();
        }
      } else {
        await this.recordFailure(scope, operation, 'uncertain_outcome');
        throw new IntegrationUnavailableError();
      }
    }

    const binding: MicrosoftTodoTaskBindingRecord = {
      createdAt: now,
      externalTaskId: task.id,
      id: microsoftTodoTaskBindingIdV1Schema.parse(
        this.dependencies.ids.next(),
      ),
      listBindingId: state.binding.id,
      occurrenceId,
      ownershipMarker,
      projectionHash,
      providerEtag: task.etag,
      scope,
      status: 'pending',
      updatedAt: now,
      version: 1,
    };
    await this.dependencies.transactions.run(scope, async (ports) => {
      await ports.microsoftTodoTaskBindings.save(binding);
      const completedOperation: ExternalWriteOperationRecord = {
        ...operation,
        attemptCount,
        state: 'succeeded',
        updatedAt: now,
      };
      await ports.externalWriteOperations.save(completedOperation);
      await appendActivity(
        this.dependencies,
        ports,
        scope,
        context,
        'delivery.microsoft_todo_task_created.v1',
        completedOperation,
      );
    });
    return binding;
  }

  private async assertExperimentalAuthority(scope: UserScope): Promise<void> {
    const account = await this.dependencies.transactions.run(scope, (ports) =>
      ports.integrationAccounts.findMicrosoft(scope),
    );
    if (
      account?.status !== 'connected' ||
      !exactSet(
        account.requestedScopes,
        MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
      ) ||
      !exactSet(
        account.graphPermissions,
        MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
      )
    )
      throw new IntegrationUnavailableError();
  }

  private async integrationAccountId(scope: UserScope): Promise<Uuid> {
    const account = await this.dependencies.transactions.run(scope, (ports) =>
      ports.integrationAccounts.findMicrosoft(scope),
    );
    if (!account) throw new IntegrationUnavailableError();
    return account.id;
  }

  private recordFailure(
    scope: UserScope,
    operation: ExternalWriteOperationRecord,
    classified: MicrosoftTodoFailureClass,
  ): Promise<void> {
    const context = { correlationId: operation.correlationId };
    return this.dependencies.transactions.run(scope, async (ports) => {
      const failedOperation: ExternalWriteOperationRecord = {
        ...operation,
        attemptCount: operation.attemptCount + 1,
        failureClass: classified,
        state: classified === 'uncertain_outcome' ? 'uncertain' : 'failed',
        updatedAt: this.dependencies.clock.now(),
      };
      await ports.externalWriteOperations.save(failedOperation);
      await appendActivity(
        this.dependencies,
        ports,
        scope,
        context,
        'integration.microsoft_todo_operation_failed.v1',
        failedOperation,
      );
    });
  }
}
