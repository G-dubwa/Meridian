import {
  ConflictError,
  DomainValidationError,
  InvalidAuthorityError,
  NotFoundError,
  actionEventPayloadV1Schema,
  assertDirectCommandAuthorityV1,
  commandReceiptIdV1Schema,
  createReminderInputV1Schema,
  createTaskInputV1Schema,
  derivationLinkIdV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  outboxMessageIdV1Schema,
  proposalEventPayloadV1Schema,
  proposalPayloadV1Schema,
  recurrenceRuleV1Schema,
  resolveExplicitReminderCommandV1,
  reminderIdV1Schema,
  reminderOccurrenceIdV1Schema,
  resourceIdV1Schema,
  taskIdV1Schema,
  transitionProposalStatusV1,
  transitionReminderStateV1,
  transitionTaskStateV1,
} from '@meridian/domain';
import type {
  ActionEventType,
  Clock,
  CommandReceiptId,
  CommandReceiptRecord,
  DomainEventEnvelopeV1,
  IdGenerator,
  OutboxMessageRecord,
  ProposalEventType,
  ProposalId,
  ProposalPayloadV1,
  ProposalRecord,
  RecurrenceRuleV1,
  ReminderPriority,
  ReminderRecord,
  TaskKind,
  TaskRecord,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface ActionCommandContext {
  readonly correlationId: Uuid;
}

export interface ActionServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface ActionReceiptResult<Target> {
  readonly receipt: CommandReceiptRecord;
  readonly target: Target;
}

export interface AcceptedReminderDetails {
  readonly expiresAt: string | null;
  readonly priority: ReminderPriority;
  readonly recurrence: RecurrenceRuleV1 | null;
  readonly timeZone: string;
  readonly triggerAt: string;
}

function actionEventFor(
  dependencies: ActionServiceDependencies,
  scope: UserScope,
  context: ActionCommandContext,
  eventType: ActionEventType,
  target: TaskRecord | ReminderRecord,
  receipt: CommandReceiptRecord | null,
  now: Date,
): DomainEventEnvelopeV1 {
  const targetType = 'title' in target ? 'task' : 'reminder';
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: target.resourceId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: actionEventPayloadV1Schema.parse({
      receiptId: receipt?.id ?? null,
      targetResourceId: target.resourceId,
      targetState: target.state,
      targetType,
    }),
    schemaVersion: 1,
    scope,
  });
}

function proposalEventFor(
  dependencies: ActionServiceDependencies,
  scope: UserScope,
  context: ActionCommandContext,
  eventType: ProposalEventType,
  proposal: ProposalRecord,
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: proposal.resourceId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: proposalEventPayloadV1Schema.parse({
      proposalId: proposal.id,
      proposalType: proposal.proposalType,
      status: proposal.status,
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: ActionServiceDependencies,
  ports: TransactionPorts,
  event: DomainEventEnvelopeV1,
  now: Date,
): Promise<void> {
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

async function existingActionResult(
  ports: TransactionPorts,
  scope: UserScope,
  context: ActionCommandContext,
  eventType: ActionEventType,
  targetType: 'task' | 'reminder',
): Promise<ActionReceiptResult<TaskRecord | ReminderRecord> | null> {
  await ports.domainEvents.acquireCommandLock(
    scope,
    context.correlationId,
    eventType,
  );
  const event = await ports.domainEvents.findByCorrelation(
    scope,
    context.correlationId,
    eventType,
  );
  if (!event) return null;
  const payload = actionEventPayloadV1Schema.parse(event.payload);
  if (payload.targetType !== targetType || payload.receiptId === null)
    throw new ConflictError('Stored command result is inconsistent.');
  const receipt = await ports.commandReceipts.findById(
    scope,
    payload.receiptId,
  );
  const target =
    targetType === 'task'
      ? await ports.tasks.findById(
          scope,
          taskIdV1Schema.parse(payload.targetResourceId),
        )
      : await ports.reminders.findById(
          scope,
          reminderIdV1Schema.parse(payload.targetResourceId),
        );
  if (!receipt || !target)
    throw new ConflictError('Stored command result is incomplete.');
  return { receipt, target };
}

function receiptFor(
  dependencies: ActionServiceDependencies,
  scope: UserScope,
  target: TaskRecord | ReminderRecord,
  now: Date,
): CommandReceiptRecord {
  return {
    createdAt: now,
    id: commandReceiptIdV1Schema.parse(dependencies.ids.next()),
    scope,
    status: 'active',
    targetResourceId: target.resourceId,
    targetType: 'title' in target ? 'task' : 'reminder',
    undoneAt: null,
    updatedAt: now,
    version: 1,
  };
}

async function persistReminderOccurrence(
  dependencies: ActionServiceDependencies,
  ports: TransactionPorts,
  reminder: ReminderRecord,
  now: Date,
): Promise<void> {
  await ports.reminderOccurrences.save({
    createdAt: now,
    id: reminderOccurrenceIdV1Schema.parse(dependencies.ids.next()),
    reminderId: reminder.id,
    scheduledFor: reminder.triggerAt,
    scope: reminder.scope,
    state: 'pending',
    updatedAt: now,
  });
}

function taskFromPayload(
  dependencies: ActionServiceDependencies,
  scope: UserScope,
  proposal: ProposalRecord,
  payload: ProposalPayloadV1,
  now: Date,
): TaskRecord {
  const id = taskIdV1Schema.parse(dependencies.ids.next());
  return {
    createdAt: now,
    creationAuthority: 'accepted_proposal',
    dueAt: null,
    estimateMinutes: null,
    goalResourceId: null,
    id,
    kind: payload.kind === 'commitment' ? 'commitment' : 'task',
    notes: payload.detail ?? '',
    resourceId: resourceIdV1Schema.parse(id),
    scope,
    sourceProposalId: proposal.id,
    state: 'open',
    title: payload.title,
    updatedAt: now,
    version: 1,
  };
}

export class ActionService {
  public constructor(
    private readonly dependencies: ActionServiceDependencies,
  ) {}

  public list(scope: UserScope): Promise<{
    readonly reminders: readonly ReminderRecord[];
    readonly tasks: readonly TaskRecord[];
  }> {
    return this.dependencies.transactions.run(scope, async (ports) => ({
      reminders: await ports.reminders.list(scope),
      tasks: await ports.tasks.list(scope),
    }));
  }

  public createTask(
    scope: UserScope,
    rawInput: unknown,
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<TaskRecord>> {
    const input = createTaskInputV1Schema.parse(rawInput);
    assertDirectCommandAuthorityV1(input.authority);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const existing = await existingActionResult(
        ports,
        scope,
        context,
        'action.task_created.v1',
        'task',
      );
      if (existing) return existing as ActionReceiptResult<TaskRecord>;
      const now = this.dependencies.clock.now();
      const id = taskIdV1Schema.parse(this.dependencies.ids.next());
      const task: TaskRecord = {
        createdAt: now,
        creationAuthority: 'explicit_command',
        dueAt: input.dueAt === null ? null : new Date(input.dueAt),
        estimateMinutes: input.estimateMinutes,
        goalResourceId: input.goalResourceId,
        id,
        kind: input.kind,
        notes: input.notes,
        resourceId: resourceIdV1Schema.parse(id),
        scope,
        sourceProposalId: null,
        state: input.dueAt === null ? 'open' : 'scheduled',
        title: input.title,
        updatedAt: now,
        version: 1,
      };
      const receipt = receiptFor(this.dependencies, scope, task, now);
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: task.resourceId,
        resourceType: 'resource.task',
        scope,
      });
      await ports.tasks.save(task);
      await ports.commandReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'action.task_created.v1',
          task,
          receipt,
          now,
        ),
        now,
      );
      return { receipt, target: task };
    });
  }

  public createReminder(
    scope: UserScope,
    rawInput: unknown,
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<ReminderRecord>> {
    const input = createReminderInputV1Schema.parse(rawInput);
    assertDirectCommandAuthorityV1(input.authority);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const existing = await existingActionResult(
        ports,
        scope,
        context,
        'action.reminder_created.v1',
        'reminder',
      );
      if (existing) return existing as ActionReceiptResult<ReminderRecord>;
      const now = this.dependencies.clock.now();
      if (new Date(input.triggerAt) <= now)
        throw new DomainValidationError(
          'The reminder trigger must be in the future.',
        );
      const id = reminderIdV1Schema.parse(this.dependencies.ids.next());
      const reminder: ReminderRecord = {
        createdAt: now,
        creationAuthority: 'explicit_command',
        deliveryPolicy: 'undecided',
        expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt),
        id,
        ownerFeedback: null,
        priority: input.priority,
        purpose: input.purpose,
        quietHoursBehavior: 'defer',
        recurrence: input.recurrence,
        relatedResourceId: input.relatedResourceId,
        resourceId: resourceIdV1Schema.parse(id),
        scope,
        sourceProposalId: null,
        state: 'scheduled',
        timeZone: input.timeZone,
        triggerAt: new Date(input.triggerAt),
        updatedAt: now,
        version: 1,
      };
      const receipt = receiptFor(this.dependencies, scope, reminder, now);
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: reminder.resourceId,
        resourceType: 'resource.reminder',
        scope,
      });
      await ports.reminders.save(reminder);
      await persistReminderOccurrence(this.dependencies, ports, reminder, now);
      await ports.commandReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'action.reminder_created.v1',
          reminder,
          receipt,
          now,
        ),
        now,
      );
      return { receipt, target: reminder };
    });
  }

  public createReminderCommand(
    scope: UserScope,
    input: {
      readonly command: string;
      readonly ownerConfirmed: boolean;
      readonly timeZone: string;
    },
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<ReminderRecord>> {
    if (!input.ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    const resolved = resolveExplicitReminderCommandV1({
      command: input.command,
      now: this.dependencies.clock.now(),
      timeZone: input.timeZone,
    });
    return this.createReminder(
      scope,
      {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        expiresAt: null,
        priority: 'normal',
        purpose: resolved.purpose,
        recurrence: null,
        relatedResourceId: null,
        timeZone: resolved.timeZone,
        triggerAt: resolved.triggerAt,
      },
      context,
    );
  }

  public acceptProposal(
    scope: UserScope,
    proposalId: ProposalId,
    input: {
      readonly acceptedReminder?: AcceptedReminderDetails;
      readonly decision: 'accept' | 'edit_accept';
      readonly editedPayload?: ProposalPayloadV1;
      readonly expectedVersion: number;
      readonly ownerConfirmed: boolean;
    },
    context: ActionCommandContext,
  ): Promise<{
    readonly proposal: ProposalRecord;
    readonly receipt: CommandReceiptRecord;
    readonly target: TaskRecord | ReminderRecord;
  }> {
    if (!input.ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    return this.dependencies.transactions.run(scope, async (ports) => {
      const current = await ports.proposals.findById(scope, proposalId);
      if (!current) throw new NotFoundError('Proposal was not found.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Proposal version is stale.');
      const now = this.dependencies.clock.now();
      if (current.expiresAt <= now)
        throw new ConflictError('Proposal has expired.');
      if (input.decision === 'edit_accept' && !input.editedPayload)
        throw new DomainValidationError(
          'Edited acceptance requires a payload.',
        );
      if (input.decision === 'accept' && input.editedPayload)
        throw new DomainValidationError(
          'Unedited acceptance cannot include an edited payload.',
        );
      if (
        input.editedPayload?.kind !== undefined &&
        input.editedPayload.kind !== current.proposalType
      )
        throw new DomainValidationError(
          'Proposal type cannot change during edit.',
        );
      if (!['task', 'commitment', 'reminder'].includes(current.proposalType))
        throw new InvalidAuthorityError(
          'This proposal type is not active in WP-10.',
        );
      if (
        current.proposalType !== 'reminder' &&
        input.acceptedReminder !== undefined
      )
        throw new DomainValidationError(
          'Reminder scheduling details apply only to reminder proposals.',
        );
      const sourceRevision = await ports.entryRevisions.findById(
        scope,
        current.sourceRevisionId,
      );
      if (!sourceRevision)
        throw new NotFoundError('Proposal source revision was not found.');
      const payload = proposalPayloadV1Schema.parse(
        input.editedPayload ?? current.payload,
      );
      const status = transitionProposalStatusV1(
        current.status,
        input.decision,
        current.assertionClass,
      );
      const updatedProposal: ProposalRecord = {
        ...current,
        decidedAt: now,
        payload,
        status,
        suppressionUntil: null,
        version: current.version + 1,
      };
      const target =
        current.proposalType === 'reminder'
          ? this.reminderFromProposal(
              scope,
              current,
              payload,
              input.acceptedReminder,
              now,
            )
          : taskFromPayload(this.dependencies, scope, current, payload, now);
      const receipt = receiptFor(this.dependencies, scope, target, now);
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: target.resourceId,
        resourceType: 'title' in target ? 'resource.task' : 'resource.reminder',
        scope,
      });
      if ('title' in target) await ports.tasks.save(target);
      else {
        await ports.reminders.save(target);
        await persistReminderOccurrence(this.dependencies, ports, target, now);
      }
      await ports.derivationLinks.append({
        assertionClass: current.assertionClass,
        confidence: current.confidence,
        createdAt: now,
        derivedResourceId: target.resourceId,
        id: derivationLinkIdV1Schema.parse(this.dependencies.ids.next()),
        invalidatedAt: null,
        invalidationReason: null,
        relation: 'derived_from',
        scope,
        sourceResourceId: resourceIdV1Schema.parse(sourceRevision.entryId),
        sourceRevisionId: current.sourceRevisionId,
        sourceSpanEnd: current.sourceSpanEnd,
        sourceSpanStart: current.sourceSpanStart,
      });
      const saved = await ports.proposals.update(
        updatedProposal,
        current.version,
      );
      if (!saved) throw new ConflictError('Proposal was changed concurrently.');
      await ports.commandReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        proposalEventFor(
          this.dependencies,
          scope,
          context,
          status === 'accepted'
            ? 'proposal.accepted.v1'
            : 'proposal.edited_accepted.v1',
          updatedProposal,
          now,
        ),
        now,
      );
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'title' in target
            ? 'action.task_created.v1'
            : 'action.reminder_created.v1',
          target,
          receipt,
          now,
        ),
        now,
      );
      return { proposal: updatedProposal, receipt, target };
    });
  }

  public editTask(
    scope: UserScope,
    receiptId: CommandReceiptId,
    input: {
      readonly dueAt: string | null;
      readonly estimateMinutes: number | null;
      readonly expectedReceiptVersion: number;
      readonly expectedTargetVersion: number;
      readonly kind: TaskKind;
      readonly notes: string;
      readonly ownerConfirmed: boolean;
      readonly title: string;
    },
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<TaskRecord>> {
    if (!input.ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    const parsed = createTaskInputV1Schema.parse({
      authority: {
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        ownerConfirmed: true,
      },
      dueAt: input.dueAt,
      estimateMinutes: input.estimateMinutes,
      goalResourceId: null,
      kind: input.kind,
      notes: input.notes,
      title: input.title,
    });
    return this.dependencies.transactions.run(scope, async (ports) => {
      const receipt = await this.activeReceipt(
        ports,
        scope,
        receiptId,
        input.expectedReceiptVersion,
        'task',
      );
      const task = await ports.tasks.findById(
        scope,
        taskIdV1Schema.parse(receipt.targetResourceId),
      );
      if (!task) throw new NotFoundError('Receipt target was not found.');
      if (task.version !== input.expectedTargetVersion)
        throw new ConflictError('Task version is stale.');
      if (['done', 'dropped', 'superseded'].includes(task.state))
        throw new ConflictError('A terminal task cannot be edited.');
      const now = this.dependencies.clock.now();
      const updated: TaskRecord = {
        ...task,
        dueAt: parsed.dueAt === null ? null : new Date(parsed.dueAt),
        estimateMinutes: parsed.estimateMinutes,
        kind: parsed.kind,
        notes: parsed.notes,
        state: parsed.dueAt === null ? 'open' : 'scheduled',
        title: parsed.title,
        updatedAt: now,
        version: task.version + 1,
      };
      if (!(await ports.tasks.update(updated, task.version)))
        throw new ConflictError('Task was changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'action.task_updated.v1',
          updated,
          receipt,
          now,
        ),
        now,
      );
      return { receipt, target: updated };
    });
  }

  public editReminder(
    scope: UserScope,
    receiptId: CommandReceiptId,
    input: AcceptedReminderDetails & {
      readonly expectedReceiptVersion: number;
      readonly expectedTargetVersion: number;
      readonly ownerConfirmed: boolean;
      readonly purpose: string;
    },
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<ReminderRecord>> {
    if (!input.ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    const parsed = createReminderInputV1Schema.parse({
      authority: {
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        ownerConfirmed: true,
      },
      expiresAt: input.expiresAt,
      priority: input.priority,
      purpose: input.purpose,
      recurrence: input.recurrence,
      relatedResourceId: null,
      timeZone: input.timeZone,
      triggerAt: input.triggerAt,
    });
    return this.dependencies.transactions.run(scope, async (ports) => {
      const receipt = await this.activeReceipt(
        ports,
        scope,
        receiptId,
        input.expectedReceiptVersion,
        'reminder',
      );
      const reminder = await ports.reminders.findById(
        scope,
        reminderIdV1Schema.parse(receipt.targetResourceId),
      );
      if (!reminder) throw new NotFoundError('Receipt target was not found.');
      if (reminder.version !== input.expectedTargetVersion)
        throw new ConflictError('Reminder version is stale.');
      if (reminder.state !== 'scheduled')
        throw new ConflictError('Only a scheduled reminder can be edited.');
      const now = this.dependencies.clock.now();
      if (new Date(parsed.triggerAt) <= now)
        throw new DomainValidationError(
          'The reminder trigger must be in the future.',
        );
      const updated: ReminderRecord = {
        ...reminder,
        expiresAt:
          parsed.expiresAt === null ? null : new Date(parsed.expiresAt),
        priority: parsed.priority,
        purpose: parsed.purpose,
        recurrence: parsed.recurrence,
        timeZone: parsed.timeZone,
        triggerAt: new Date(parsed.triggerAt),
        updatedAt: now,
        version: reminder.version + 1,
      };
      if (!(await ports.reminders.update(updated, reminder.version)))
        throw new ConflictError('Reminder was changed concurrently.');
      await ports.reminderOccurrences.cancelPending(scope, reminder.id, now);
      await persistReminderOccurrence(this.dependencies, ports, updated, now);
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'action.reminder_updated.v1',
          updated,
          receipt,
          now,
        ),
        now,
      );
      return { receipt, target: updated };
    });
  }

  public undo(
    scope: UserScope,
    receiptId: CommandReceiptId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: ActionCommandContext,
  ): Promise<ActionReceiptResult<TaskRecord | ReminderRecord>> {
    if (!ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    return this.dependencies.transactions.run(scope, async (ports) => {
      const receipt = await ports.commandReceipts.findById(scope, receiptId);
      if (!receipt) throw new NotFoundError('Command receipt was not found.');
      if (receipt.status !== 'active' || receipt.version !== expectedVersion)
        throw new ConflictError('Command receipt is no longer active.');
      const now = this.dependencies.clock.now();
      let target: TaskRecord | ReminderRecord;
      if (receipt.targetType === 'task') {
        const task = await ports.tasks.findById(
          scope,
          taskIdV1Schema.parse(receipt.targetResourceId),
        );
        if (!task) throw new NotFoundError('Receipt target was not found.');
        target = {
          ...task,
          state: transitionTaskStateV1(task.state, 'dropped'),
          updatedAt: now,
          version: task.version + 1,
        };
        if (!(await ports.tasks.update(target, task.version)))
          throw new ConflictError('Task was changed concurrently.');
      } else {
        const reminder = await ports.reminders.findById(
          scope,
          reminderIdV1Schema.parse(receipt.targetResourceId),
        );
        if (!reminder) throw new NotFoundError('Receipt target was not found.');
        target = {
          ...reminder,
          state: transitionReminderStateV1(reminder.state, 'dismissed'),
          updatedAt: now,
          version: reminder.version + 1,
        };
        if (!(await ports.reminders.update(target, reminder.version)))
          throw new ConflictError('Reminder was changed concurrently.');
        await ports.reminderOccurrences.cancelPending(scope, reminder.id, now);
      }
      const undoneReceipt: CommandReceiptRecord = {
        ...receipt,
        status: 'undone',
        undoneAt: now,
        updatedAt: now,
        version: receipt.version + 1,
      };
      if (!(await ports.commandReceipts.update(undoneReceipt, receipt.version)))
        throw new ConflictError('Command receipt was changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        actionEventFor(
          this.dependencies,
          scope,
          context,
          'action.receipt_undone.v1',
          target,
          undoneReceipt,
          now,
        ),
        now,
      );
      return { receipt: undoneReceipt, target };
    });
  }

  private reminderFromProposal(
    scope: UserScope,
    proposal: ProposalRecord,
    payload: ProposalPayloadV1,
    details: AcceptedReminderDetails | undefined,
    now: Date,
  ): ReminderRecord {
    if (!details)
      throw new InvalidAuthorityError(
        'A reminder proposal needs an owner-confirmed trigger and time zone.',
      );
    const parsed = createReminderInputV1Schema.parse({
      authority: {
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        ownerConfirmed: true,
      },
      expiresAt: details.expiresAt,
      priority: details.priority,
      purpose: payload.title,
      recurrence:
        details.recurrence === null
          ? null
          : recurrenceRuleV1Schema.parse(details.recurrence),
      relatedResourceId: null,
      timeZone: details.timeZone,
      triggerAt: details.triggerAt,
    });
    const id = reminderIdV1Schema.parse(this.dependencies.ids.next());
    if (new Date(parsed.triggerAt) <= now)
      throw new DomainValidationError(
        'The reminder trigger must be in the future.',
      );
    return {
      createdAt: now,
      creationAuthority: 'accepted_proposal',
      deliveryPolicy: 'undecided',
      expiresAt: parsed.expiresAt === null ? null : new Date(parsed.expiresAt),
      id,
      ownerFeedback: null,
      priority: parsed.priority,
      purpose: parsed.purpose,
      quietHoursBehavior: 'defer',
      recurrence: parsed.recurrence,
      relatedResourceId: null,
      resourceId: resourceIdV1Schema.parse(id),
      scope,
      sourceProposalId: proposal.id,
      state: 'scheduled',
      timeZone: parsed.timeZone,
      triggerAt: new Date(parsed.triggerAt),
      updatedAt: now,
      version: 1,
    };
  }

  private async activeReceipt(
    ports: TransactionPorts,
    scope: UserScope,
    receiptId: CommandReceiptId,
    expectedVersion: number,
    targetType: 'task' | 'reminder',
  ): Promise<CommandReceiptRecord> {
    const receipt = await ports.commandReceipts.findById(scope, receiptId);
    if (!receipt) throw new NotFoundError('Command receipt was not found.');
    if (
      receipt.status !== 'active' ||
      receipt.version !== expectedVersion ||
      receipt.targetType !== targetType
    )
      throw new ConflictError('Command receipt is not valid for this edit.');
    return receipt;
  }
}
