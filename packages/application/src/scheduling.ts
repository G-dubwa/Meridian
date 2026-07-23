import {
  ConflictError,
  DomainValidationError,
  NotFoundError,
  acceptSchedulingProposalInputV1Schema,
  calendarBlockIdV1Schema,
  createSchedulingProposalInputV1Schema,
  dismissSchedulingProposalInputV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  outboxMessageIdV1Schema,
  resourceIdV1Schema,
  schedulingEventPayloadV1Schema,
  schedulingProposalIdV1Schema,
} from '@meridian/domain';
import type {
  CalendarBlockRecord,
  Clock,
  DomainEventEnvelopeV1,
  IdGenerator,
  OutboxMessageRecord,
  SchedulingEventType,
  SchedulingProposalRecord,
  GoalRecord,
  TaskRecord,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';
import { proposeBlocks } from '@meridian/scheduling';

export interface SchedulingServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface SchedulingCommandContext {
  readonly correlationId: Uuid;
}

export interface SchedulingSnapshot {
  readonly blocks: readonly CalendarBlockRecord[];
  readonly goals: readonly GoalRecord[];
  readonly proposals: readonly SchedulingProposalRecord[];
  readonly providerStatus: 'not_configured';
  readonly tasks: readonly TaskRecord[];
}

function eventFor(
  dependencies: SchedulingServiceDependencies,
  scope: UserScope,
  context: SchedulingCommandContext,
  eventType: SchedulingEventType,
  proposal: SchedulingProposalRecord,
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: schedulingEventPayloadV1Schema.parse({
      blockCount: proposal.candidates.length,
      proposalId: proposal.id,
      state: proposal.state,
      verdict: proposal.verdict,
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: SchedulingServiceDependencies,
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

async function priorResult(
  ports: TransactionPorts,
  scope: UserScope,
  context: SchedulingCommandContext,
  eventType: SchedulingEventType,
): Promise<SchedulingProposalRecord | null> {
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
  const resolvedEvent =
    event ??
    (eventType === 'scheduling.proposal_accepted.v1'
      ? await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'scheduling.proposal_staled.v1',
        )
      : null);
  if (!resolvedEvent) return null;
  const payload = schedulingEventPayloadV1Schema.parse(resolvedEvent.payload);
  const proposal = await ports.schedulingProposals.findById(
    scope,
    payload.proposalId,
  );
  if (!proposal)
    throw new ConflictError('Stored scheduling command target is missing.');
  return proposal;
}

function sameCandidates(
  left: SchedulingProposalRecord['candidates'],
  right: SchedulingProposalRecord['candidates'],
): boolean {
  return (
    left.length === right.length &&
    left.every((candidate, index) => {
      const other = right[index];
      return (
        other?.endsAt === candidate.endsAt &&
        candidate.minutes === other.minutes &&
        candidate.ordinal === other.ordinal &&
        candidate.startsAt === other.startsAt
      );
    })
  );
}

async function calculate(
  ports: TransactionPorts,
  scope: UserScope,
  input: {
    readonly bufferMinutes: number;
    readonly earliestStart: Date;
    readonly estimatedEffortMinutes: number;
    readonly maxBlockMinutes: number;
    readonly maxDeepWorkMinutesPerDay: number;
    readonly minBlockMinutes: number;
    readonly timeZone: string;
    readonly workingWindows: readonly {
      readonly endsAt: Date;
      readonly startsAt: Date;
    }[];
    readonly deadline: Date;
  },
) {
  const [agenda, blocks] = await Promise.all([
    ports.agendaBlocks.listBetween(scope, input.earliestStart, input.deadline),
    ports.calendarBlocks.listBetween(
      scope,
      input.earliestStart,
      input.deadline,
    ),
  ]);
  return proposeBlocks({
    availability: input.workingWindows,
    bufferMinutes: input.bufferMinutes,
    busy: [
      ...agenda
        .filter((item) => item.state === 'planned')
        .map((item) => ({ endsAt: item.endsAt, startsAt: item.startsAt })),
      ...blocks
        .filter((item) => item.state === 'planned')
        .map((item) => ({
          endsAt: item.currentEndsAt,
          startsAt: item.currentStartsAt,
        })),
    ],
    estimatedEffortMinutes: input.estimatedEffortMinutes,
    maxBlockMinutes: input.maxBlockMinutes,
    maxDeepWorkMinutesPerDay: input.maxDeepWorkMinutesPerDay,
    minBlockMinutes: input.minBlockMinutes,
    timeZone: input.timeZone,
  });
}

export class SchedulingService {
  public constructor(
    private readonly dependencies: SchedulingServiceDependencies,
  ) {}

  public get(scope: UserScope): Promise<SchedulingSnapshot> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const [blocks, goals, proposals, tasks] = await Promise.all([
        ports.calendarBlocks.listBetween(
          scope,
          new Date('1970-01-01T00:00:00.000Z'),
          new Date('9999-12-31T23:59:59.999Z'),
        ),
        ports.goals.list(scope),
        ports.schedulingProposals.list(scope),
        ports.tasks.list(scope),
      ]);
      return {
        blocks,
        goals: goals.filter((goal) =>
          ['incubating', 'active', 'paused'].includes(goal.state),
        ),
        proposals,
        providerStatus: 'not_configured',
        tasks: tasks.filter((task) => task.state === 'open'),
      };
    });
  }

  public create(
    scope: UserScope,
    rawInput: unknown,
    context: SchedulingCommandContext,
  ): Promise<SchedulingProposalRecord> {
    const input = createSchedulingProposalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await priorResult(
        ports,
        scope,
        context,
        'scheduling.proposal_created.v1',
      );
      if (prior) return prior;
      const [task, goal] = await Promise.all([
        input.taskId ? ports.tasks.findById(scope, input.taskId) : null,
        input.goalId ? ports.goals.findById(scope, input.goalId) : null,
      ]);
      if ((input.taskId && !task) || (input.goalId && !goal))
        throw new NotFoundError('The linked local task or goal was not found.');
      await ports.schedulingProposals.acquirePlanningLock(scope);
      const earliestStart = new Date(input.earliestStart);
      const deadline = new Date(input.deadline);
      const now = this.dependencies.clock.now();
      if (earliestStart < now)
        throw new DomainValidationError(
          'A local scheduling horizon cannot begin in the past.',
        );
      const workingWindows = input.workingWindows.map((window) => ({
        endsAt: new Date(window.endsAt),
        startsAt: new Date(window.startsAt),
      }));
      const result = await calculate(ports, scope, {
        ...input,
        deadline,
        earliestStart,
        workingWindows,
      });
      const proposal: SchedulingProposalRecord = {
        ...result,
        bufferMinutes: input.bufferMinutes,
        createdAt: now,
        deadline,
        earliestStart,
        estimatedEffortMinutes: input.estimatedEffortMinutes,
        goalId: input.goalId,
        id: schedulingProposalIdV1Schema.parse(this.dependencies.ids.next()),
        maxBlockMinutes: input.maxBlockMinutes,
        maxDeepWorkMinutesPerDay: input.maxDeepWorkMinutesPerDay,
        minBlockMinutes: input.minBlockMinutes,
        scope,
        state: 'pending',
        taskId: input.taskId,
        timeZone: input.timeZone,
        title: input.title,
        updatedAt: now,
        version: 1,
        workingWindows,
      };
      await ports.schedulingProposals.save(proposal);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'scheduling.proposal_created.v1',
          proposal,
          now,
        ),
        now,
      );
      return proposal;
    });
  }

  public accept(
    scope: UserScope,
    id: SchedulingProposalRecord['id'],
    rawInput: unknown,
    context: SchedulingCommandContext,
  ): Promise<SchedulingProposalRecord> {
    const input = acceptSchedulingProposalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await priorResult(
        ports,
        scope,
        context,
        'scheduling.proposal_accepted.v1',
      );
      if (prior) return prior;
      await ports.schedulingProposals.acquirePlanningLock(scope);
      const current = await ports.schedulingProposals.findById(scope, id);
      if (!current)
        throw new NotFoundError('Scheduling proposal was not found.');
      if (current.state !== 'pending')
        throw new ConflictError('Only a pending proposal can be accepted.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Scheduling proposal version is stale.');
      if (current.verdict === 'infeasible')
        throw new ConflictError('An infeasible proposal cannot be accepted.');
      const [task, goal] = await Promise.all([
        current.taskId ? ports.tasks.findById(scope, current.taskId) : null,
        current.goalId ? ports.goals.findById(scope, current.goalId) : null,
      ]);
      const targetUnavailable =
        (current.taskId !== null &&
          (!task || ['done', 'dropped', 'superseded'].includes(task.state))) ||
        (current.goalId !== null &&
          (!goal || ['completed', 'retired', 'merged'].includes(goal.state)));
      if (targetUnavailable) {
        const now = this.dependencies.clock.now();
        const stale: SchedulingProposalRecord = {
          ...current,
          state: 'stale',
          updatedAt: now,
          version: current.version + 1,
        };
        if (!(await ports.schedulingProposals.update(stale, current.version)))
          throw new ConflictError('Scheduling proposal changed concurrently.');
        await appendEvent(
          this.dependencies,
          ports,
          eventFor(
            this.dependencies,
            scope,
            context,
            'scheduling.proposal_staled.v1',
            stale,
            now,
          ),
          now,
        );
        return stale;
      }
      const result = await calculate(ports, scope, current);
      const now = this.dependencies.clock.now();
      if (!sameCandidates(current.candidates, result.candidates)) {
        const stale: SchedulingProposalRecord = {
          ...current,
          state: 'stale',
          updatedAt: now,
          version: current.version + 1,
        };
        if (!(await ports.schedulingProposals.update(stale, current.version)))
          throw new ConflictError('Scheduling proposal changed concurrently.');
        await appendEvent(
          this.dependencies,
          ports,
          eventFor(
            this.dependencies,
            scope,
            context,
            'scheduling.proposal_staled.v1',
            stale,
            now,
          ),
          now,
        );
        return stale;
      }
      for (const candidate of current.candidates) {
        const blockId = calendarBlockIdV1Schema.parse(
          this.dependencies.ids.next(),
        );
        const block: CalendarBlockRecord = {
          approvalRecordedAt: now,
          createdAt: now,
          currentEndsAt: new Date(candidate.endsAt),
          currentStartsAt: new Date(candidate.startsAt),
          goalId: current.goalId,
          id: blockId,
          ordinal: candidate.ordinal,
          originalEndsAt: new Date(candidate.endsAt),
          originalStartsAt: new Date(candidate.startsAt),
          plannedEffortMinutes: candidate.minutes,
          proposalId: current.id,
          resourceId: resourceIdV1Schema.parse(blockId),
          scope,
          state: 'planned',
          taskId: current.taskId,
          timeZone: current.timeZone,
          title: current.title,
          updatedAt: now,
          version: 1,
        };
        await ports.resources.save({
          createdAt: now,
          deletedAt: null,
          id: block.resourceId,
          resourceType: 'resource.calendar_block',
          scope,
        });
        await ports.calendarBlocks.save(block);
      }
      const accepted: SchedulingProposalRecord = {
        ...current,
        state: 'accepted',
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.schedulingProposals.update(accepted, current.version)))
        throw new ConflictError('Scheduling proposal changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'scheduling.proposal_accepted.v1',
          accepted,
          now,
        ),
        now,
      );
      return accepted;
    });
  }

  public dismiss(
    scope: UserScope,
    id: SchedulingProposalRecord['id'],
    rawInput: unknown,
    context: SchedulingCommandContext,
  ): Promise<SchedulingProposalRecord> {
    const input = dismissSchedulingProposalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await priorResult(
        ports,
        scope,
        context,
        'scheduling.proposal_dismissed.v1',
      );
      if (prior) return prior;
      const current = await ports.schedulingProposals.findById(scope, id);
      if (!current)
        throw new NotFoundError('Scheduling proposal was not found.');
      if (current.state !== 'pending')
        throw new ConflictError('Only a pending proposal can be dismissed.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Scheduling proposal version is stale.');
      const now = this.dependencies.clock.now();
      const dismissed: SchedulingProposalRecord = {
        ...current,
        state: 'dismissed',
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.schedulingProposals.update(dismissed, current.version)))
        throw new ConflictError('Scheduling proposal changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'scheduling.proposal_dismissed.v1',
          dismissed,
          now,
        ),
        now,
      );
      return dismissed;
    });
  }
}
