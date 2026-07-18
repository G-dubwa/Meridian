import {
  ConflictError,
  NotFoundError,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  entryIdV1Schema,
  entryRevisionIdV1Schema,
  journalBodyMarkdownV1Schema,
  journalLifecycleEventPayloadV1Schema,
  journalRevisionEventPayloadV1Schema,
  outboxMessageIdV1Schema,
  processingClassV1Schema,
  resourceIdV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  DomainEventEnvelopeV1,
  EntryId,
  EntryRecord,
  EntryRevisionId,
  EntryRevisionRecord,
  IdGenerator,
  JournalChangeKind,
  JournalEntryStatus,
  JournalEventType,
  OutboxMessageRecord,
  ProcessingClass,
  SecretService,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface JournalCommandContext {
  readonly correlationId: Uuid;
}

export interface CreateJournalEntryInput {
  readonly bodyMarkdown: string;
  readonly occurredAt?: Date;
  readonly processingClass: ProcessingClass;
}

export interface ReviseJournalEntryInput extends CreateJournalEntryInput {
  readonly expectedVersion: number;
}

export interface JournalEntryView {
  readonly entry: EntryRecord;
  readonly currentRevision: EntryRevisionRecord;
  readonly revisions: readonly EntryRevisionRecord[];
}

export interface MaterialChangeInvalidation {
  readonly scope: UserScope;
  readonly entryId: EntryId;
  readonly previousRevisionId: EntryRevisionId;
  readonly currentRevisionId: EntryRevisionId;
  readonly changeKind: Extract<JournalChangeKind, 'content' | 'privacy'>;
}

export interface MaterialChangeInvalidationHook {
  invalidate(change: MaterialChangeInvalidation): Promise<void>;
}

export class NoopMaterialChangeInvalidationHook implements MaterialChangeInvalidationHook {
  public invalidate(change: MaterialChangeInvalidation): Promise<void> {
    void change;
    return Promise.resolve();
  }
}

export interface JournalServiceDependencies {
  readonly transactions: TransactionManager;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly contentHasher: Pick<SecretService, 'hash'>;
  readonly invalidation: MaterialChangeInvalidationHook;
}

function sensitivityFor(
  processingClass: ProcessingClass,
): EntryRecord['sensitivity'] {
  return processingClass === 'standard' ? 'normal' : processingClass;
}

function journalEvent(
  dependencies: JournalServiceDependencies,
  scope: UserScope,
  context: JournalCommandContext,
  eventType: JournalEventType,
  entryId: EntryId,
  occurredAt: Date,
  payload: Readonly<Record<string, unknown>>,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: resourceIdV1Schema.parse(entryId),
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: occurredAt.toISOString(),
    payload,
    schemaVersion: 1,
    scope,
  });
}

async function appendJournalEvent(
  dependencies: JournalServiceDependencies,
  ports: TransactionPorts,
  event: DomainEventEnvelopeV1,
  now: Date,
): Promise<void> {
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: now,
    createdAt: now,
    event,
    id: outboxMessageIdV1Schema.parse(dependencies.ids.next()),
    deadLetteredAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    processedAt: null,
    status: 'pending',
    topic: event.eventType,
  };
  await ports.domainEvents.append(event);
  await ports.outbox.append(outbox);
}

async function viewFor(
  ports: TransactionPorts,
  scope: UserScope,
  entryId: EntryId,
): Promise<JournalEntryView> {
  const entry = await ports.entries.findById(scope, entryId);
  if (!entry?.currentRevisionId)
    throw new NotFoundError('Journal entry was not found.');
  const revisions = await ports.entryRevisions.listForEntry(scope, entryId);
  const currentRevision = revisions.find(
    (revision) => revision.id === entry.currentRevisionId,
  );
  if (!currentRevision)
    throw new ConflictError('Journal entry revision state is inconsistent.');
  return { currentRevision, entry, revisions };
}

async function idempotentView(
  ports: TransactionPorts,
  scope: UserScope,
  context: JournalCommandContext,
  eventType: JournalEventType,
): Promise<JournalEntryView | null> {
  await ports.domainEvents.acquireCommandLock(
    scope,
    context.correlationId,
    eventType,
  );
  const existing = await ports.domainEvents.findByCorrelation(
    scope,
    context.correlationId,
    eventType,
  );
  if (!existing?.aggregateId) return null;
  return viewFor(ports, scope, entryIdV1Schema.parse(existing.aggregateId));
}

export class JournalService {
  public constructor(
    private readonly dependencies: JournalServiceDependencies,
  ) {}

  public createEntry(
    scope: UserScope,
    input: CreateJournalEntryInput,
    context: JournalCommandContext,
  ): Promise<JournalEntryView> {
    const bodyMarkdown = journalBodyMarkdownV1Schema.parse(input.bodyMarkdown);
    const processingClass = processingClassV1Schema.parse(
      input.processingClass,
    );
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await idempotentView(
        ports,
        scope,
        context,
        'journal.entry_created.v1',
      );
      if (prior) return prior;

      const now = this.dependencies.clock.now();
      const entryId = entryIdV1Schema.parse(this.dependencies.ids.next());
      const revisionId = entryRevisionIdV1Schema.parse(
        this.dependencies.ids.next(),
      );
      const revision: EntryRevisionRecord = {
        bodyMarkdown,
        bodyRaw: null,
        changeKind: 'content',
        contentHash: this.dependencies.contentHasher.hash(bodyMarkdown),
        createdAt: now,
        createdBy: 'user',
        entryId,
        id: revisionId,
        occurredAt: input.occurredAt ?? now,
        processingClass,
        revisionNumber: 1,
        scope,
      };
      const entry: EntryRecord = {
        attrs: {},
        attrsSchemaKey: 'attrs.entry',
        attrsSchemaVersion: 1,
        createdAt: now,
        currentRevisionId: revisionId,
        id: entryId,
        resourceId: resourceIdV1Schema.parse(entryId),
        scope,
        sensitivity: sensitivityFor(processingClass),
        status: 'active',
        updatedAt: now,
        version: 1,
      };
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: entry.resourceId,
        resourceType: 'resource.entry',
        scope,
      });
      await ports.entries.save(entry);
      await ports.entryRevisions.append(revision);
      const payload = journalRevisionEventPayloadV1Schema.parse({
        changeKind: revision.changeKind,
        entryId,
        processingClass,
        revisionId,
        revisionNumber: 1,
      });
      await appendJournalEvent(
        this.dependencies,
        ports,
        journalEvent(
          this.dependencies,
          scope,
          context,
          'journal.entry_created.v1',
          entryId,
          now,
          payload,
        ),
        now,
      );
      return { currentRevision: revision, entry, revisions: [revision] };
    });
  }

  public listEntries(scope: UserScope): Promise<readonly JournalEntryView[]> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const entries = await ports.entries.list(scope);
      return Promise.all(
        entries.map((entry) => viewFor(ports, scope, entry.id)),
      );
    });
  }

  public getEntry(
    scope: UserScope,
    entryId: EntryId,
  ): Promise<JournalEntryView> {
    return this.dependencies.transactions.run(scope, (ports) =>
      viewFor(ports, scope, entryIdV1Schema.parse(entryId)),
    );
  }

  public reviseEntry(
    scope: UserScope,
    entryId: EntryId,
    input: ReviseJournalEntryInput,
    context: JournalCommandContext,
  ): Promise<JournalEntryView> {
    const parsedEntryId = entryIdV1Schema.parse(entryId);
    const bodyMarkdown = journalBodyMarkdownV1Schema.parse(input.bodyMarkdown);
    const processingClass = processingClassV1Schema.parse(
      input.processingClass,
    );
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await idempotentView(
        ports,
        scope,
        context,
        'journal.entry_revised.v1',
      );
      if (prior) return prior;

      const currentView = await viewFor(ports, scope, parsedEntryId);
      if (currentView.entry.status !== 'active')
        throw new ConflictError('Only active journal entries can be revised.');
      if (currentView.entry.version !== input.expectedVersion)
        throw new ConflictError('Journal entry version has changed.');
      const bodyChanged =
        currentView.currentRevision.bodyMarkdown !== bodyMarkdown;
      const privacyChanged =
        currentView.currentRevision.processingClass !== processingClass;
      if (!bodyChanged && !privacyChanged)
        throw new ConflictError('A revision must change content or privacy.');

      const now = this.dependencies.clock.now();
      const revisionId = entryRevisionIdV1Schema.parse(
        this.dependencies.ids.next(),
      );
      const changeKind: Extract<JournalChangeKind, 'content' | 'privacy'> =
        bodyChanged ? 'content' : 'privacy';
      const revision: EntryRevisionRecord = {
        bodyMarkdown,
        bodyRaw: null,
        changeKind,
        contentHash: this.dependencies.contentHasher.hash(bodyMarkdown),
        createdAt: now,
        createdBy: 'user',
        entryId: parsedEntryId,
        id: revisionId,
        occurredAt: input.occurredAt ?? now,
        processingClass,
        revisionNumber: currentView.currentRevision.revisionNumber + 1,
        scope,
      };
      const entry: EntryRecord = {
        ...currentView.entry,
        currentRevisionId: revisionId,
        sensitivity: sensitivityFor(processingClass),
        updatedAt: now,
        version: currentView.entry.version + 1,
      };
      await ports.entryRevisions.append(revision);
      if (!(await ports.entries.update(entry, input.expectedVersion)))
        throw new ConflictError('Journal entry version has changed.');

      const payload = journalRevisionEventPayloadV1Schema.parse({
        changeKind,
        entryId: parsedEntryId,
        processingClass,
        revisionId,
        revisionNumber: revision.revisionNumber,
      });
      await appendJournalEvent(
        this.dependencies,
        ports,
        journalEvent(
          this.dependencies,
          scope,
          context,
          'journal.entry_revised.v1',
          parsedEntryId,
          now,
          payload,
        ),
        now,
      );
      if (privacyChanged) {
        await appendJournalEvent(
          this.dependencies,
          ports,
          journalEvent(
            this.dependencies,
            scope,
            context,
            'journal.entry_privacy_changed.v1',
            parsedEntryId,
            now,
            payload,
          ),
          now,
        );
      }
      await this.dependencies.invalidation.invalidate({
        changeKind,
        currentRevisionId: revisionId,
        entryId: parsedEntryId,
        previousRevisionId: currentView.currentRevision.id,
        scope,
      });
      return {
        currentRevision: revision,
        entry,
        revisions: [...currentView.revisions, revision],
      };
    });
  }

  public archiveEntry(
    scope: UserScope,
    entryId: EntryId,
    expectedVersion: number,
    context: JournalCommandContext,
  ): Promise<JournalEntryView> {
    return this.transitionStatus(
      scope,
      entryId,
      expectedVersion,
      'archived',
      'journal.entry_archived.v1',
      context,
    );
  }

  public requestHardDeletion(
    scope: UserScope,
    entryId: EntryId,
    expectedVersion: number,
    context: JournalCommandContext,
  ): Promise<JournalEntryView> {
    return this.transitionStatus(
      scope,
      entryId,
      expectedVersion,
      'deletion_requested',
      'journal.entry_deletion_requested.v1',
      context,
    );
  }

  public listActivity(
    scope: UserScope,
    limit = 50,
  ): Promise<readonly DomainEventEnvelopeV1[]> {
    return this.dependencies.transactions.run(scope, (ports) =>
      ports.domainEvents.listByTypePrefix(scope, 'journal.', limit),
    );
  }

  private transitionStatus(
    scope: UserScope,
    entryId: EntryId,
    expectedVersion: number,
    status: Exclude<JournalEntryStatus, 'active'>,
    eventType: Extract<
      JournalEventType,
      'journal.entry_archived.v1' | 'journal.entry_deletion_requested.v1'
    >,
    context: JournalCommandContext,
  ): Promise<JournalEntryView> {
    const parsedEntryId = entryIdV1Schema.parse(entryId);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await idempotentView(ports, scope, context, eventType);
      if (prior) return prior;
      const currentView = await viewFor(ports, scope, parsedEntryId);
      if (currentView.entry.version !== expectedVersion)
        throw new ConflictError('Journal entry version has changed.');
      if (
        eventType === 'journal.entry_archived.v1' &&
        currentView.entry.status !== 'active'
      )
        throw new ConflictError('Only active entries can be archived.');
      if (currentView.entry.status === 'deletion_requested')
        throw new ConflictError('Deletion has already been requested.');

      const now = this.dependencies.clock.now();
      const entry: EntryRecord = {
        ...currentView.entry,
        status,
        updatedAt: now,
        version: currentView.entry.version + 1,
      };
      if (!(await ports.entries.update(entry, expectedVersion)))
        throw new ConflictError('Journal entry version has changed.');
      const payload = journalLifecycleEventPayloadV1Schema.parse({
        entryId: parsedEntryId,
        entryVersion: entry.version,
      });
      await appendJournalEvent(
        this.dependencies,
        ports,
        journalEvent(
          this.dependencies,
          scope,
          context,
          eventType,
          parsedEntryId,
          now,
          payload,
        ),
        now,
      );
      return { ...currentView, entry };
    });
  }
}
