import {
  ConflictError,
  DomainValidationError,
  InvalidAuthorityError,
  NotFoundError,
  agendaBlockIdV1Schema,
  agendaBlockStateV1Schema,
  createAgendaBlockInputV1Schema,
  dailyPriorityIdV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  localDateBoundsV1,
  localDateV1Schema,
  outboxMessageIdV1Schema,
  reminderIdV1Schema,
  reminderStateV1Schema,
  resourceIdV1Schema,
  selectDailyPriorityInputV1Schema,
  taskIdV1Schema,
  taskStateV1Schema,
  timeZoneV1Schema,
  todayEventPayloadV1Schema,
  todayReceiptIdV1Schema,
  updateAgendaBlockInputV1Schema,
} from '@meridian/domain';
import type {
  AgendaBlockId,
  AgendaBlockRecord,
  Clock,
  CommandReceiptRecord,
  DailyPriorityRecord,
  DailyPriorityId,
  DomainEventEnvelopeV1,
  IdGenerator,
  OutboxMessageRecord,
  ReminderId,
  ReminderRecord,
  ResourceId,
  TaskId,
  TaskRecord,
  TodayEventType,
  TodayLifecycleAction,
  TodayReceiptId,
  TodayReceiptRecord,
  TodayTargetType,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface TodayServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface TodayCommandContext {
  readonly correlationId: Uuid;
}

export interface TodayTaskItem {
  readonly receipt: CommandReceiptRecord | null;
  readonly task: TaskRecord;
}

export interface TodayReminderItem {
  readonly receipt: CommandReceiptRecord | null;
  readonly reminder: ReminderRecord;
}

export interface TodaySnapshot {
  readonly agendaBlocks: readonly AgendaBlockRecord[];
  readonly channel: {
    readonly externalDeliveryActive: false;
    readonly status: 'inactive';
  };
  readonly localDate: string;
  readonly priorities: readonly DailyPriorityRecord[];
  readonly reminders: readonly TodayReminderItem[];
  readonly tasks: readonly TodayTaskItem[];
  readonly timeZone: string;
}

function eventFor(
  dependencies: TodayServiceDependencies,
  scope: UserScope,
  context: TodayCommandContext,
  eventType: TodayEventType,
  targetResourceId: ResourceId,
  targetType: TodayTargetType,
  action: string,
  receiptId: TodayReceiptId | null,
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: targetResourceId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: todayEventPayloadV1Schema.parse({
      action,
      receiptId,
      targetResourceId,
      targetType,
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: TodayServiceDependencies,
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

function receiptFor(
  dependencies: TodayServiceDependencies,
  scope: UserScope,
  targetResourceId: ResourceId,
  targetType: TodayTargetType,
  action: TodayLifecycleAction,
  priorState: string | null,
  resultingVersion: number,
  effectId: DailyPriorityId | null,
  now: Date,
): TodayReceiptRecord {
  return {
    action,
    createdAt: now,
    effectId,
    id: todayReceiptIdV1Schema.parse(dependencies.ids.next()),
    priorState,
    resultingVersion,
    scope,
    status: 'active',
    targetResourceId,
    targetType,
    undoneAt: null,
    updatedAt: now,
    version: 1,
  };
}

async function existingReceipt(
  ports: TransactionPorts,
  scope: UserScope,
  context: TodayCommandContext,
  eventType: TodayEventType,
): Promise<TodayReceiptRecord | null> {
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
  const payload = todayEventPayloadV1Schema.parse(event.payload);
  if (!payload.receiptId)
    throw new ConflictError('Stored Today command result is incomplete.');
  const receipt = await ports.todayReceipts.findById(scope, payload.receiptId);
  if (!receipt) throw new ConflictError('Stored Today receipt was not found.');
  return receipt;
}

export class TodayService {
  public constructor(private readonly dependencies: TodayServiceDependencies) {}

  public get(
    scope: UserScope,
    rawLocalDate: string,
    rawTimeZone: string,
  ): Promise<TodaySnapshot> {
    const localDate = localDateV1Schema.parse(rawLocalDate);
    const timeZone = timeZoneV1Schema.parse(rawTimeZone);
    const bounds = localDateBoundsV1(localDate, timeZone);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const priorities = await ports.dailyPriorities.listForDate(
        scope,
        localDate,
      );
      const allTasks = await ports.tasks.list(scope);
      const priorityIds = new Set(priorities.map((item) => item.taskId));
      const tasks = allTasks.filter(
        (task) =>
          !['dropped', 'superseded'].includes(task.state) &&
          (priorityIds.has(task.id) ||
            task.dueAt === null ||
            task.dueAt < bounds.end),
      );
      const reminders = (await ports.reminders.list(scope)).filter(
        (reminder) =>
          reminder.triggerAt >= bounds.start &&
          reminder.triggerAt < bounds.end &&
          !['expired'].includes(reminder.state),
      );
      return {
        agendaBlocks: await ports.agendaBlocks.listBetween(
          scope,
          bounds.start,
          bounds.end,
        ),
        channel: {
          externalDeliveryActive: false,
          status: 'inactive',
        },
        localDate,
        priorities,
        reminders: await Promise.all(
          reminders.map(async (reminder) => ({
            receipt: await ports.commandReceipts.findActiveForTarget(
              scope,
              reminder.resourceId,
            ),
            reminder,
          })),
        ),
        tasks: await Promise.all(
          tasks.map(async (task) => ({
            receipt: await ports.commandReceipts.findActiveForTarget(
              scope,
              task.resourceId,
            ),
            task,
          })),
        ),
        timeZone,
      };
    });
  }

  public createAgendaBlock(
    scope: UserScope,
    rawInput: unknown,
    context: TodayCommandContext,
  ): Promise<AgendaBlockRecord> {
    const input = createAgendaBlockInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'today.agenda_block_created.v1',
      );
      const prior = await ports.domainEvents.findByCorrelation(
        scope,
        context.correlationId,
        'today.agenda_block_created.v1',
      );
      if (prior?.aggregateId) {
        const existing = await ports.agendaBlocks.findById(
          scope,
          agendaBlockIdV1Schema.parse(prior.aggregateId),
        );
        if (existing) return existing;
        throw new ConflictError('Stored agenda-block result is incomplete.');
      }
      const now = this.dependencies.clock.now();
      const id = agendaBlockIdV1Schema.parse(this.dependencies.ids.next());
      const record: AgendaBlockRecord = {
        createdAt: now,
        endsAt: new Date(input.endsAt),
        id,
        notes: input.notes,
        resourceId: resourceIdV1Schema.parse(id),
        scope,
        startsAt: new Date(input.startsAt),
        state: 'planned',
        timeZone: input.timeZone,
        title: input.title,
        updatedAt: now,
        version: 1,
      };
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: record.resourceId,
        resourceType: 'resource.agenda_block',
        scope,
      });
      await ports.agendaBlocks.save(record);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'today.agenda_block_created.v1',
          record.resourceId,
          'agenda_block',
          'created',
          null,
          now,
        ),
        now,
      );
      return record;
    });
  }

  public updateAgendaBlock(
    scope: UserScope,
    id: AgendaBlockId,
    rawInput: unknown,
    context: TodayCommandContext,
  ): Promise<AgendaBlockRecord> {
    const input = updateAgendaBlockInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const current = await ports.agendaBlocks.findById(scope, id);
      if (!current) throw new NotFoundError('Agenda block was not found.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Agenda block version is stale.');
      if (current.state !== 'planned')
        throw new ConflictError('A terminal agenda block cannot be edited.');
      const now = this.dependencies.clock.now();
      const updated: AgendaBlockRecord = {
        ...current,
        endsAt: new Date(input.endsAt),
        notes: input.notes,
        startsAt: new Date(input.startsAt),
        timeZone: input.timeZone,
        title: input.title,
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.agendaBlocks.update(updated, current.version)))
        throw new ConflictError('Agenda block changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'today.agenda_block_updated.v1',
          updated.resourceId,
          'agenda_block',
          'updated',
          null,
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public selectPriority(
    scope: UserScope,
    rawInput: unknown,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    const input = selectDailyPriorityInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await existingReceipt(
        ports,
        scope,
        context,
        'today.priority_selected.v1',
      );
      if (prior) return prior;
      await ports.dailyPriorities.acquireDateLock(scope, input.localDate);
      const task = await ports.tasks.findById(scope, input.taskId);
      if (!task) throw new NotFoundError('Priority task was not found.');
      if (['done', 'dropped', 'superseded'].includes(task.state))
        throw new ConflictError('A terminal task cannot be prioritised.');
      const current = await ports.dailyPriorities.listForDate(
        scope,
        input.localDate,
      );
      if (current.length >= 3)
        throw new DomainValidationError(
          'A day can have at most three priorities.',
        );
      if (current.some((item) => item.taskId === task.id))
        throw new ConflictError('This task is already a daily priority.');
      if (current.some((item) => item.position === input.position))
        throw new ConflictError('This priority position is already occupied.');
      const now = this.dependencies.clock.now();
      const priority: DailyPriorityRecord = {
        createdAt: now,
        id: dailyPriorityIdV1Schema.parse(this.dependencies.ids.next()),
        localDate: input.localDate,
        position: input.position as 1 | 2 | 3,
        scope,
        taskId: task.id,
        updatedAt: now,
        version: 1,
      };
      const receipt = receiptFor(
        this.dependencies,
        scope,
        task.resourceId,
        'priority',
        'priority_selected',
        null,
        priority.version,
        priority.id,
        now,
      );
      await ports.dailyPriorities.save(priority);
      await ports.todayReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'today.priority_selected.v1',
          task.resourceId,
          'priority',
          receipt.action,
          receipt.id,
          now,
        ),
        now,
      );
      return receipt;
    });
  }

  public completeTask(
    scope: UserScope,
    id: TaskId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    return this.taskLifecycle(
      scope,
      id,
      expectedVersion,
      ownerConfirmed,
      context,
    );
  }

  public completeReminder(
    scope: UserScope,
    id: ReminderId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    return this.reminderLifecycle(
      scope,
      id,
      expectedVersion,
      ownerConfirmed,
      'completed',
      context,
    );
  }

  public dismissReminder(
    scope: UserScope,
    id: ReminderId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    return this.reminderLifecycle(
      scope,
      id,
      expectedVersion,
      ownerConfirmed,
      'dismissed',
      context,
    );
  }

  public settleAgendaBlock(
    scope: UserScope,
    id: AgendaBlockId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    nextState: 'completed' | 'cancelled',
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    if (!ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    const action =
      nextState === 'completed' ? 'agenda_completed' : 'agenda_cancelled';
    const eventType =
      nextState === 'completed'
        ? 'today.agenda_block_completed.v1'
        : 'today.agenda_block_cancelled.v1';
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await existingReceipt(ports, scope, context, eventType);
      if (prior) return prior;
      const current = await ports.agendaBlocks.findById(scope, id);
      if (!current) throw new NotFoundError('Agenda block was not found.');
      if (current.version !== expectedVersion)
        throw new ConflictError('Agenda block version is stale.');
      if (current.state !== 'planned')
        throw new ConflictError('Agenda block is already terminal.');
      const now = this.dependencies.clock.now();
      const updated: AgendaBlockRecord = {
        ...current,
        state: nextState,
        updatedAt: now,
        version: current.version + 1,
      };
      const receipt = receiptFor(
        this.dependencies,
        scope,
        updated.resourceId,
        'agenda_block',
        action,
        current.state,
        updated.version,
        null,
        now,
      );
      if (!(await ports.agendaBlocks.update(updated, current.version)))
        throw new ConflictError('Agenda block changed concurrently.');
      await ports.todayReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          eventType,
          updated.resourceId,
          'agenda_block',
          action,
          receipt.id,
          now,
        ),
        now,
      );
      return receipt;
    });
  }

  public undo(
    scope: UserScope,
    id: TodayReceiptId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    if (!ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    return this.dependencies.transactions.run(scope, async (ports) => {
      const receipt = await ports.todayReceipts.findById(scope, id);
      if (!receipt) throw new NotFoundError('Today receipt was not found.');
      if (receipt.version !== expectedVersion)
        throw new ConflictError('Today receipt version is stale.');
      if (receipt.status !== 'active')
        throw new ConflictError('Today receipt was already undone.');
      const now = this.dependencies.clock.now();
      await this.reverseEffect(ports, scope, receipt, now);
      const updated: TodayReceiptRecord = {
        ...receipt,
        status: 'undone',
        undoneAt: now,
        updatedAt: now,
        version: receipt.version + 1,
      };
      if (!(await ports.todayReceipts.update(updated, receipt.version)))
        throw new ConflictError('Today receipt changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'today.change_undone.v1',
          receipt.targetResourceId,
          receipt.targetType,
          receipt.action,
          updated.id,
          now,
        ),
        now,
      );
      return updated;
    });
  }

  private taskLifecycle(
    scope: UserScope,
    id: TaskId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    if (!ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await existingReceipt(
        ports,
        scope,
        context,
        'today.task_completed.v1',
      );
      if (prior) return prior;
      const current = await ports.tasks.findById(scope, id);
      if (!current) throw new NotFoundError('Task was not found.');
      if (current.version !== expectedVersion)
        throw new ConflictError('Task version is stale.');
      if (!['open', 'scheduled'].includes(current.state))
        throw new ConflictError('Only an active task can be completed.');
      const now = this.dependencies.clock.now();
      const updated: TaskRecord = {
        ...current,
        state: 'done',
        updatedAt: now,
        version: current.version + 1,
      };
      const receipt = receiptFor(
        this.dependencies,
        scope,
        updated.resourceId,
        'task',
        'task_completed',
        current.state,
        updated.version,
        null,
        now,
      );
      if (!(await ports.tasks.update(updated, current.version)))
        throw new ConflictError('Task changed concurrently.');
      await ports.todayReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'today.task_completed.v1',
          updated.resourceId,
          'task',
          receipt.action,
          receipt.id,
          now,
        ),
        now,
      );
      return receipt;
    });
  }

  private reminderLifecycle(
    scope: UserScope,
    id: ReminderId,
    expectedVersion: number,
    ownerConfirmed: boolean,
    nextState: 'completed' | 'dismissed',
    context: TodayCommandContext,
  ): Promise<TodayReceiptRecord> {
    if (!ownerConfirmed)
      throw new InvalidAuthorityError('Owner confirmation is required.');
    const action =
      nextState === 'completed' ? 'reminder_completed' : 'reminder_dismissed';
    const eventType =
      nextState === 'completed'
        ? 'today.reminder_completed.v1'
        : 'today.reminder_dismissed.v1';
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await existingReceipt(ports, scope, context, eventType);
      if (prior) return prior;
      const current = await ports.reminders.findById(scope, id);
      if (!current) throw new NotFoundError('Reminder was not found.');
      if (current.version !== expectedVersion)
        throw new ConflictError('Reminder version is stale.');
      if (!['scheduled', 'due', 'delivered'].includes(current.state))
        throw new ConflictError('Reminder is already terminal.');
      const now = this.dependencies.clock.now();
      const updated: ReminderRecord = {
        ...current,
        state: nextState,
        updatedAt: now,
        version: current.version + 1,
      };
      const receipt = receiptFor(
        this.dependencies,
        scope,
        updated.resourceId,
        'reminder',
        action,
        current.state,
        updated.version,
        null,
        now,
      );
      if (!(await ports.reminders.update(updated, current.version)))
        throw new ConflictError('Reminder changed concurrently.');
      await ports.reminderOccurrences.settle(
        scope,
        current.id,
        nextState === 'completed' ? 'acknowledged' : 'dismissed',
        now,
      );
      await ports.todayReceipts.save(receipt);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          eventType,
          updated.resourceId,
          'reminder',
          action,
          receipt.id,
          now,
        ),
        now,
      );
      return receipt;
    });
  }

  private async reverseEffect(
    ports: TransactionPorts,
    scope: UserScope,
    receipt: TodayReceiptRecord,
    now: Date,
  ): Promise<void> {
    if (receipt.targetType === 'priority') {
      if (!receipt.effectId)
        throw new ConflictError('Priority receipt is incomplete.');
      const priorityId = dailyPriorityIdV1Schema.parse(receipt.effectId);
      const priority = await ports.dailyPriorities.findById(scope, priorityId);
      if (priority?.version !== receipt.resultingVersion)
        throw new ConflictError('Priority changed after this receipt.');
      if (!(await ports.dailyPriorities.delete(scope, priorityId)))
        throw new ConflictError('Priority could not be removed.');
      return;
    }
    if (!receipt.priorState)
      throw new ConflictError('Lifecycle receipt has no prior state.');
    if (receipt.targetType === 'task') {
      const task = await ports.tasks.findById(
        scope,
        taskIdV1Schema.parse(receipt.targetResourceId),
      );
      if (task?.version !== receipt.resultingVersion)
        throw new ConflictError('Task changed after this receipt.');
      const restored: TaskRecord = {
        ...task,
        state: taskStateV1Schema.parse(receipt.priorState),
        updatedAt: now,
        version: task.version + 1,
      };
      if (!(await ports.tasks.update(restored, task.version)))
        throw new ConflictError('Task undo conflicted.');
      return;
    }
    if (receipt.targetType === 'reminder') {
      const reminder = await ports.reminders.findById(
        scope,
        reminderIdV1Schema.parse(receipt.targetResourceId),
      );
      if (reminder?.version !== receipt.resultingVersion)
        throw new ConflictError('Reminder changed after this receipt.');
      const restored: ReminderRecord = {
        ...reminder,
        state: reminderStateV1Schema.parse(receipt.priorState),
        updatedAt: now,
        version: reminder.version + 1,
      };
      if (!(await ports.reminders.update(restored, reminder.version)))
        throw new ConflictError('Reminder undo conflicted.');
      await ports.reminderOccurrences.restoreSettled(
        scope,
        reminder.id,
        receipt.action === 'reminder_completed' ? 'acknowledged' : 'dismissed',
        now,
      );
      return;
    }
    const agenda = await ports.agendaBlocks.findById(
      scope,
      agendaBlockIdV1Schema.parse(receipt.targetResourceId),
    );
    if (agenda?.version !== receipt.resultingVersion)
      throw new ConflictError('Agenda block changed after this receipt.');
    const restored: AgendaBlockRecord = {
      ...agenda,
      state: agendaBlockStateV1Schema.parse(receipt.priorState),
      updatedAt: now,
      version: agenda.version + 1,
    };
    if (!(await ports.agendaBlocks.update(restored, agenda.version)))
      throw new ConflictError('Agenda-block undo conflicted.');
  }
}
