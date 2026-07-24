import {
  ConflictError,
  DomainValidationError,
  NotFoundError,
  actionEventPayloadV1Schema,
  calendarBlockIdV1Schema,
  confidenceClassForEvidenceV1,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  executionEventPayloadV1Schema,
  executionRecordIdV1Schema,
  localDateBoundsV1,
  outboxMessageIdV1Schema,
  postBlockConfirmationInputV1Schema,
  reconcileElapsedBlocksInputV1Schema,
  weeklyReviewQueryV1Schema,
} from '@meridian/domain';
import type {
  CalendarBlockRecord,
  Clock,
  DomainEventEnvelopeV1,
  ExecutionEventType,
  ExecutionRecord,
  IdGenerator,
  OutboxMessageRecord,
  TaskRecord,
  TodayReceiptRecord,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface ExecutionServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface ExecutionCommandContext {
  readonly correlationId: Uuid;
}

export interface ExecutionInboxItem {
  readonly block: CalendarBlockRecord;
  readonly record: ExecutionRecord | null;
  readonly status: 'awaiting_confirmation' | 'recorded';
}

export interface WeeklyObservation {
  readonly code:
    | 'insufficient_evidence'
    | 'unknown_exceeds_confirmed'
    | 'confirmed_matches_plan'
    | 'postponements_repeated';
  readonly evidenceRecordIds: readonly ExecutionRecord['id'][];
}

export interface WeeklyReviewSnapshot {
  readonly completedTaskCount: number;
  readonly confirmedCompletedMinutes: number;
  readonly confirmedPartialMinutes: number;
  readonly explicitlyNotCompletedMinutes: number;
  readonly inbox: readonly ExecutionInboxItem[];
  readonly observations: readonly WeeklyObservation[];
  readonly openTriageCount: number;
  readonly plannedMinutes: number;
  readonly postponedTaskEditCount: number;
  readonly reminderCompletedCount: number;
  readonly reminderDismissedCount: number;
  readonly rescheduledMinutes: number;
  readonly timeZone: string;
  readonly unknownElapsedMinutes: number;
  readonly weekEndsBefore: Date;
  readonly weekStartsAt: Date;
  readonly weekStartsOn: string;
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eventFor(
  dependencies: ExecutionServiceDependencies,
  scope: UserScope,
  context: ExecutionCommandContext,
  eventType: ExecutionEventType,
  record: ExecutionRecord,
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: record.calendarBlockId ?? record.taskId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: executionEventPayloadV1Schema.parse({
      calendarBlockId: record.calendarBlockId,
      confidenceClass: record.confidenceClass,
      evidenceType: record.evidenceType,
      executionRecordId: record.id,
      outcome: record.outcome,
      taskId: record.taskId,
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: ExecutionServiceDependencies,
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

export async function persistTaskCompletionEvidence(
  dependencies: ExecutionServiceDependencies,
  ports: TransactionPorts,
  scope: UserScope,
  task: TaskRecord,
  receipt: TodayReceiptRecord,
  context: ExecutionCommandContext,
  now: Date,
): Promise<ExecutionRecord> {
  const prior = await ports.executionRecords.findBySourceReceipt(
    scope,
    receipt.id,
  );
  if (prior) return prior;
  const record: ExecutionRecord = {
    calendarBlockId: null,
    confidenceClass: 'owner_confirmed',
    evidenceType: 'user_completed_task',
    id: executionRecordIdV1Schema.parse(dependencies.ids.next()),
    occurredAt: now,
    outcome: 'confirmed_completed',
    recordedAt: now,
    reportedDurationMinutes: null,
    retractedAt: null,
    retractionReason: null,
    scope,
    source: 'today_task_completion',
    sourceReceiptId: receipt.id,
    taskId: task.id,
  };
  await ports.executionRecords.save(record);
  await appendEvent(
    dependencies,
    ports,
    eventFor(
      dependencies,
      scope,
      context,
      'execution.recorded.v1',
      record,
      now,
    ),
    now,
  );
  return record;
}

export async function retractTaskCompletionEvidence(
  dependencies: ExecutionServiceDependencies,
  ports: TransactionPorts,
  scope: UserScope,
  receipt: TodayReceiptRecord,
  context: ExecutionCommandContext,
  now: Date,
): Promise<void> {
  if (receipt.action !== 'task_completed') return;
  const retracted = await ports.executionRecords.retractForReceipt(
    scope,
    receipt.id,
    now,
  );
  if (!retracted) return;
  await appendEvent(
    dependencies,
    ports,
    eventFor(
      dependencies,
      scope,
      context,
      'execution.record_retracted.v1',
      retracted,
      now,
    ),
    now,
  );
}

function responseRecord(
  dependencies: ExecutionServiceDependencies,
  scope: UserScope,
  block: CalendarBlockRecord,
  input: {
    readonly reportedDurationMinutes: number | null;
    readonly response:
      'done' | 'partly_done' | 'not_done' | 'rescheduled' | 'skip';
  },
  now: Date,
): ExecutionRecord {
  const evidenceType =
    input.response === 'done' || input.response === 'partly_done'
      ? 'post_block_confirmed'
      : input.response === 'not_done'
        ? 'user_reported_not_done'
        : 'calendar_elapsed_unknown';
  const outcome =
    input.response === 'done'
      ? 'confirmed_completed'
      : input.response === 'partly_done'
        ? 'confirmed_partial'
        : input.response === 'not_done'
          ? 'not_completed'
          : input.response === 'rescheduled'
            ? 'rescheduled'
            : 'unknown';
  const confidenceClass = confidenceClassForEvidenceV1(evidenceType);
  return {
    calendarBlockId: block.id,
    confidenceClass,
    evidenceType,
    id: executionRecordIdV1Schema.parse(dependencies.ids.next()),
    occurredAt: block.currentEndsAt,
    outcome,
    recordedAt: now,
    reportedDurationMinutes:
      input.response === 'done'
        ? block.plannedEffortMinutes
        : input.reportedDurationMinutes,
    retractedAt: null,
    retractionReason: null,
    scope,
    source: 'post_block_confirmation',
    sourceReceiptId: null,
    taskId: block.taskId,
  };
}

function observationFor(
  plannedMinutes: number,
  confirmedMinutes: number,
  unknownMinutes: number,
  postponedCount: number,
  records: readonly ExecutionRecord[],
): readonly WeeklyObservation[] {
  const ids = records
    .filter((record) => record.retractedAt === null)
    .map((record) => record.id);
  const observations: WeeklyObservation[] = [];
  if (records.length < 3)
    observations.push({
      code: 'insufficient_evidence',
      evidenceRecordIds: ids,
    });
  else if (unknownMinutes > confirmedMinutes)
    observations.push({
      code: 'unknown_exceeds_confirmed',
      evidenceRecordIds: ids,
    });
  else if (plannedMinutes > 0 && confirmedMinutes >= plannedMinutes * 0.8)
    observations.push({
      code: 'confirmed_matches_plan',
      evidenceRecordIds: ids,
    });
  if (postponedCount >= 2)
    observations.push({
      code: 'postponements_repeated',
      evidenceRecordIds: [],
    });
  return observations.slice(0, 3);
}

export class ExecutionService {
  public constructor(
    private readonly dependencies: ExecutionServiceDependencies,
  ) {}

  public respondToBlock(
    scope: UserScope,
    rawBlockId: string,
    rawInput: unknown,
    context: ExecutionCommandContext,
  ): Promise<ExecutionRecord> {
    const blockId = calendarBlockIdV1Schema.parse(rawBlockId);
    const input = postBlockConfirmationInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.executionRecords.acquireEvidenceLock(scope);
      const priorEvent = await ports.domainEvents.findByCorrelation(
        scope,
        context.correlationId,
        'execution.recorded.v1',
      );
      if (priorEvent) {
        const payload = executionEventPayloadV1Schema.parse(priorEvent.payload);
        const existing = await ports.executionRecords.findActiveForBlock(
          scope,
          blockId,
        );
        if (existing?.id === payload.executionRecordId) return existing;
        throw new ConflictError('Stored execution command result is missing.');
      }
      const block = await ports.calendarBlocks.findById(scope, blockId);
      if (!block)
        throw new NotFoundError('Local planning block was not found.');
      if (block.version !== input.expectedBlockVersion)
        throw new ConflictError('Local planning block version is stale.');
      if (block.state !== 'planned')
        throw new ConflictError('A cancelled block cannot receive evidence.');
      const now = this.dependencies.clock.now();
      if (block.currentEndsAt > now)
        throw new ConflictError(
          'Execution evidence cannot be recorded before the block ends.',
        );
      if (
        input.response === 'partly_done' &&
        input.reportedDurationMinutes !== null &&
        input.reportedDurationMinutes >= block.plannedEffortMinutes
      )
        throw new DomainValidationError(
          'Partial duration must be less than planned effort.',
        );
      if (await ports.executionRecords.findActiveForBlock(scope, blockId))
        throw new ConflictError('This block already has execution evidence.');
      const record = responseRecord(
        this.dependencies,
        scope,
        block,
        input,
        now,
      );
      await ports.executionRecords.save(record);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'execution.recorded.v1',
          record,
          now,
        ),
        now,
      );
      return record;
    });
  }

  public reconcileElapsed(
    scope: UserScope,
    rawInput: unknown,
    context: ExecutionCommandContext,
  ): Promise<{ readonly recorded: number }> {
    const input = reconcileElapsedBlocksInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.executionRecords.acquireEvidenceLock(scope);
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'execution.elapsed_reconciled.v1',
      );
      const prior = await ports.domainEvents.findByCorrelation(
        scope,
        context.correlationId,
        'execution.elapsed_reconciled.v1',
      );
      if (prior) {
        const count = (prior.payload as { recordCount?: unknown }).recordCount;
        if (typeof count !== 'number')
          throw new ConflictError('Stored reconciliation result is invalid.');
        return { recorded: count };
      }
      const through = new Date(input.through);
      const now = this.dependencies.clock.now();
      if (through > now)
        throw new DomainValidationError(
          'Elapsed reconciliation cannot look into the future.',
        );
      const blocks = await ports.calendarBlocks.listBetween(
        scope,
        new Date('1970-01-01T00:00:00.000Z'),
        through,
      );
      let recorded = 0;
      for (const block of blocks) {
        if (
          block.state !== 'planned' ||
          block.currentEndsAt > through ||
          (await ports.executionRecords.findActiveForBlock(scope, block.id))
        )
          continue;
        await ports.executionRecords.save(
          responseRecord(
            this.dependencies,
            scope,
            block,
            { reportedDurationMinutes: null, response: 'skip' },
            now,
          ),
        );
        recorded += 1;
      }
      const event = domainEventEnvelopeV1Schema.parse({
        correlationId: context.correlationId,
        eventId: domainEventIdV1Schema.parse(this.dependencies.ids.next()),
        eventType: 'execution.elapsed_reconciled.v1',
        occurredAt: now.toISOString(),
        payload: { recordCount: recorded },
        schemaVersion: 1,
        scope,
      });
      await appendEvent(this.dependencies, ports, event, now);
      return { recorded };
    });
  }

  public weekly(
    scope: UserScope,
    rawQuery: unknown,
  ): Promise<WeeklyReviewSnapshot> {
    const query = weeklyReviewQueryV1Schema.parse(rawQuery);
    const weekStartsAt = localDateBoundsV1(
      query.weekStartsOn,
      query.timeZone,
    ).start;
    const weekEndsBefore = localDateBoundsV1(
      addDays(query.weekStartsOn, 6),
      query.timeZone,
    ).end;
    return this.dependencies.transactions.run(scope, async (ports) => {
      const [
        blocks,
        records,
        taskEvents,
        completedReminderEvents,
        dismissedReminderEvents,
      ] = await Promise.all([
        ports.calendarBlocks.listBetween(scope, weekStartsAt, weekEndsBefore),
        ports.executionRecords.listBetween(scope, weekStartsAt, weekEndsBefore),
        ports.domainEvents.listByTypePrefix(scope, 'action.task_updated', 500),
        ports.domainEvents.listByTypePrefix(
          scope,
          'today.reminder_completed',
          500,
        ),
        ports.domainEvents.listByTypePrefix(
          scope,
          'today.reminder_dismissed',
          500,
        ),
      ]);
      const activeRecords = records.filter(
        (record) => record.retractedAt === null,
      );
      const activeBlocks = blocks.filter((block) => block.state === 'planned');
      const recordByBlock = new Map(
        activeRecords
          .filter((record) => record.calendarBlockId !== null)
          .map((record) => [record.calendarBlockId, record]),
      );
      const within = (event: DomainEventEnvelopeV1) =>
        new Date(event.occurredAt) >= weekStartsAt &&
        new Date(event.occurredAt) < weekEndsBefore;
      const postponedTaskEditCount = taskEvents.filter((event) => {
        if (!within(event)) return false;
        return (
          actionEventPayloadV1Schema.parse(event.payload).dueDateChange ===
          'later'
        );
      }).length;
      const plannedMinutes = activeBlocks.reduce(
        (sum, block) => sum + block.plannedEffortMinutes,
        0,
      );
      const minutesFor = (outcome: ExecutionRecord['outcome']) =>
        activeRecords
          .filter((record) => record.outcome === outcome)
          .reduce((sum, record) => {
            if (record.reportedDurationMinutes !== null)
              return sum + record.reportedDurationMinutes;
            const block = activeBlocks.find(
              (candidate) => candidate.id === record.calendarBlockId,
            );
            return sum + (block?.plannedEffortMinutes ?? 0);
          }, 0);
      const confirmedCompletedMinutes = minutesFor('confirmed_completed');
      const confirmedPartialMinutes = minutesFor('confirmed_partial');
      const unknownElapsedMinutes = minutesFor('unknown');
      return {
        completedTaskCount: activeRecords.filter(
          (record) => record.evidenceType === 'user_completed_task',
        ).length,
        confirmedCompletedMinutes,
        confirmedPartialMinutes,
        explicitlyNotCompletedMinutes: minutesFor('not_completed'),
        inbox: activeBlocks
          .filter(
            (block) => block.currentEndsAt <= this.dependencies.clock.now(),
          )
          .map((block) => ({
            block,
            record: recordByBlock.get(block.id) ?? null,
            status: recordByBlock.has(block.id)
              ? ('recorded' as const)
              : ('awaiting_confirmation' as const),
          })),
        observations: observationFor(
          plannedMinutes,
          confirmedCompletedMinutes + confirmedPartialMinutes,
          unknownElapsedMinutes,
          postponedTaskEditCount,
          activeRecords,
        ),
        openTriageCount: (
          await ports.proposals.listPending(
            scope,
            this.dependencies.clock.now(),
          )
        ).length,
        plannedMinutes,
        postponedTaskEditCount,
        reminderCompletedCount: completedReminderEvents.filter(within).length,
        reminderDismissedCount: dismissedReminderEvents.filter(within).length,
        rescheduledMinutes: minutesFor('rescheduled'),
        timeZone: query.timeZone,
        unknownElapsedMinutes,
        weekEndsBefore,
        weekStartsAt,
        weekStartsOn: query.weekStartsOn,
      };
    });
  }
}
