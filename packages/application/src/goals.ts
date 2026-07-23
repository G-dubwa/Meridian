import {
  ConflictError,
  DomainValidationError,
  InvalidAuthorityError,
  NotFoundError,
  activeGoalGuidanceV1,
  createEdgeInputV1Schema,
  createGoalInputV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  edgeIdV1Schema,
  goalEventPayloadV1Schema,
  goalIdV1Schema,
  outboxMessageIdV1Schema,
  ownerConfirmedV1Schema,
  resourceIdV1Schema,
  transitionGoalInputV1Schema,
  transitionGoalStateV1,
  updateGoalInputV1Schema,
  updateGoalLimitInputV1Schema,
} from '@meridian/domain';
import type {
  ActiveGoalGuidance,
  Clock,
  DomainEventEnvelopeV1,
  EdgeRecord,
  GoalEventType,
  GoalRecord,
  IdGenerator,
  OutboxMessageRecord,
  ResourceId,
  TaskRecord,
  TransactionManager,
  TransactionPorts,
  UserRecord,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface GoalServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface GoalCommandContext {
  readonly correlationId: Uuid;
}

export interface GoalBlocker {
  readonly blockingResourceIds: readonly ResourceId[];
  readonly goalResourceId: ResourceId;
}

export interface GoalSnapshot {
  readonly blockers: readonly GoalBlocker[];
  readonly edges: readonly EdgeRecord[];
  readonly goals: readonly GoalRecord[];
  readonly guidance: ActiveGoalGuidance;
  readonly linkedTasks: readonly TaskRecord[];
}

function eventFor(
  dependencies: GoalServiceDependencies,
  scope: UserScope,
  context: GoalCommandContext,
  eventType: GoalEventType,
  aggregateId: ResourceId | undefined,
  payload: Parameters<typeof goalEventPayloadV1Schema.parse>[0],
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    ...(aggregateId === undefined ? {} : { aggregateId }),
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: goalEventPayloadV1Schema.parse(payload),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: GoalServiceDependencies,
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

async function acquireCommand(
  ports: TransactionPorts,
  scope: UserScope,
  context: GoalCommandContext,
  eventType: GoalEventType,
): Promise<DomainEventEnvelopeV1 | null> {
  await ports.domainEvents.acquireCommandLock(
    scope,
    context.correlationId,
    eventType,
  );
  return ports.domainEvents.findByCorrelation(
    scope,
    context.correlationId,
    eventType,
  );
}

async function existingGoalResult(
  ports: TransactionPorts,
  scope: UserScope,
  event: DomainEventEnvelopeV1 | null,
): Promise<GoalRecord | null> {
  if (!event) return null;
  if (!event.aggregateId)
    throw new ConflictError('Stored goal command result is incomplete.');
  const goal = await ports.goals.findById(
    scope,
    goalIdV1Schema.parse(event.aggregateId),
  );
  if (!goal) throw new ConflictError('Stored goal command target is missing.');
  return goal;
}

function contentFreePayload(input: {
  readonly action:
    | 'created'
    | 'updated'
    | 'transitioned'
    | 'edge_created'
    | 'edge_removed'
    | 'load_limit_updated';
  readonly activeLimit?: number | null;
  readonly edge?: EdgeRecord | null;
  readonly goal?: GoalRecord | null;
  readonly sourceResourceId?: ResourceId | null;
  readonly targetResourceId?: ResourceId | null;
}) {
  return {
    action: input.action,
    activeLimit: input.activeLimit ?? null,
    edgeId: input.edge?.id ?? null,
    edgeType: input.edge?.edgeType ?? null,
    goalState: input.goal?.state ?? null,
    sourceResourceId:
      input.edge?.sourceResourceId ?? input.sourceResourceId ?? null,
    targetResourceId:
      input.edge?.targetResourceId ?? input.targetResourceId ?? null,
  };
}

function wouldCreateDependencyCycle(
  source: ResourceId,
  target: ResourceId,
  edges: readonly EdgeRecord[],
): boolean {
  const adjacency = new Map<ResourceId, ResourceId[]>();
  for (const edge of edges) {
    if (edge.edgeType !== 'depends_on' || edge.removedAt !== null) continue;
    const targets = adjacency.get(edge.sourceResourceId) ?? [];
    targets.push(edge.targetResourceId);
    adjacency.set(edge.sourceResourceId, targets);
  }
  const pending = [target];
  const visited = new Set<ResourceId>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === source) return true;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function blockersFor(
  goals: readonly GoalRecord[],
  edges: readonly EdgeRecord[],
): readonly GoalBlocker[] {
  const goalByResource = new Map(goals.map((goal) => [goal.resourceId, goal]));
  const blockers = new Map<ResourceId, Set<ResourceId>>();
  const add = (goal: ResourceId, blocker: ResourceId) => {
    const values = blockers.get(goal) ?? new Set<ResourceId>();
    values.add(blocker);
    blockers.set(goal, values);
  };
  for (const edge of edges) {
    if (edge.edgeType === 'depends_on') {
      const dependency = goalByResource.get(edge.targetResourceId);
      if (dependency?.state !== 'completed')
        add(edge.sourceResourceId, edge.targetResourceId);
    }
    if (edge.edgeType === 'blocks') {
      const source = goalByResource.get(edge.sourceResourceId);
      if (source?.state !== 'completed')
        add(edge.targetResourceId, edge.sourceResourceId);
    }
  }
  return [...blockers.entries()].map(
    ([goalResourceId, blockingResourceIds]) => ({
      blockingResourceIds: [...blockingResourceIds],
      goalResourceId,
    }),
  );
}

export class GoalService {
  public constructor(private readonly dependencies: GoalServiceDependencies) {}

  public get(scope: UserScope): Promise<GoalSnapshot> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const [goals, edges, tasks, user] = await Promise.all([
        ports.goals.list(scope),
        ports.edges.list(scope),
        ports.tasks.list(scope),
        ports.users.findById(scope.userId),
      ]);
      if (!user) throw new NotFoundError('Owner settings were not found.');
      const activeCount = goals.filter(
        (goal) => goal.state === 'active',
      ).length;
      return {
        blockers: blockersFor(goals, edges),
        edges,
        goals,
        guidance: activeGoalGuidanceV1(activeCount, user.softActiveGoalLimit),
        linkedTasks: tasks.filter((task) => task.goalResourceId !== null),
      };
    });
  }

  public create(
    scope: UserScope,
    rawInput: unknown,
    context: GoalCommandContext,
  ): Promise<GoalRecord> {
    const input = createGoalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.created.v1',
      );
      const existing = await existingGoalResult(ports, scope, prior);
      if (existing) return existing;
      const now = this.dependencies.clock.now();
      const id = goalIdV1Schema.parse(this.dependencies.ids.next());
      const goal: GoalRecord = {
        createdAt: now,
        creationAuthority: 'manual',
        id,
        lifeDomain: input.lifeDomain,
        narrative: input.narrative,
        resourceId: resourceIdV1Schema.parse(id),
        scope,
        sourceProposalId: null,
        state: 'incubating',
        successCriteria: input.successCriteria,
        targetDate: input.targetDate,
        title: input.title,
        type: input.type,
        updatedAt: now,
        version: 1,
      };
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: goal.resourceId,
        resourceType: 'resource.goal',
        scope,
      });
      await ports.goals.save(goal);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.created.v1',
          goal.resourceId,
          contentFreePayload({ action: 'created', goal }),
          now,
        ),
        now,
      );
      return goal;
    });
  }

  public update(
    scope: UserScope,
    goalId: GoalRecord['id'],
    rawInput: unknown,
    context: GoalCommandContext,
  ): Promise<GoalRecord> {
    const input = updateGoalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.updated.v1',
      );
      const existing = await existingGoalResult(ports, scope, prior);
      if (existing) return existing;
      await ports.schedulingProposals.acquirePlanningLock(scope);
      const current = await ports.goals.findById(scope, goalId);
      if (!current) throw new NotFoundError('Goal was not found.');
      if (['completed', 'retired', 'merged'].includes(current.state))
        throw new ConflictError('Terminal goals cannot be edited.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Goal version is stale.');
      const now = this.dependencies.clock.now();
      const updated: GoalRecord = {
        ...current,
        lifeDomain: input.lifeDomain,
        narrative: input.narrative,
        successCriteria: input.successCriteria,
        targetDate: input.targetDate,
        title: input.title,
        type: input.type,
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.goals.update(updated, current.version)))
        throw new ConflictError('Goal changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.updated.v1',
          updated.resourceId,
          contentFreePayload({ action: 'updated', goal: updated }),
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public transition(
    scope: UserScope,
    goalId: GoalRecord['id'],
    rawInput: unknown,
    context: GoalCommandContext,
  ): Promise<GoalRecord> {
    const input = transitionGoalInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.transitioned.v1',
      );
      const existing = await existingGoalResult(ports, scope, prior);
      if (existing) return existing;
      await ports.schedulingProposals.acquirePlanningLock(scope);
      const current = await ports.goals.findById(scope, goalId);
      if (!current) throw new NotFoundError('Goal was not found.');
      if (current.version !== input.expectedVersion)
        throw new ConflictError('Goal version is stale.');
      transitionGoalStateV1(current.state, input.nextState);

      if (input.nextState === 'active') {
        await ports.goals.acquireActiveGoalLock(scope);
        const [goals, user] = await Promise.all([
          ports.goals.list(scope),
          ports.users.findById(scope.userId),
        ]);
        if (!user) throw new NotFoundError('Owner settings were not found.');
        const activeCount = goals.filter(
          (goal) => goal.state === 'active' && goal.id !== current.id,
        ).length;
        if (
          activeCount >= user.softActiveGoalLimit &&
          !input.acknowledgeActiveLimit
        )
          throw new ConflictError(
            'Activating this goal exceeds the soft active-goal limit.',
            {
              activeCount,
              limit: user.softActiveGoalLimit,
              requiresAcknowledgement: true,
            },
          );
      }

      let mergeEdge: EdgeRecord | null = null;
      if (input.mergedIntoGoalId) {
        if (input.mergedIntoGoalId === current.id)
          throw new DomainValidationError('A goal cannot merge into itself.');
        const target = await ports.goals.findById(
          scope,
          input.mergedIntoGoalId,
        );
        if (
          !target ||
          ['completed', 'retired', 'merged'].includes(target.state)
        )
          throw new ConflictError('Merge target is unavailable.');
        const now = this.dependencies.clock.now();
        mergeEdge = {
          createdAt: now,
          edgeType: 'merged_into',
          id: edgeIdV1Schema.parse(this.dependencies.ids.next()),
          removedAt: null,
          scope,
          sourceResourceId: current.resourceId,
          targetResourceId: target.resourceId,
          updatedAt: now,
          version: 1,
        };
        await ports.edges.save(mergeEdge);
      }

      const now = this.dependencies.clock.now();
      const updated: GoalRecord = {
        ...current,
        state: input.nextState,
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.goals.update(updated, current.version)))
        throw new ConflictError('Goal changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.transitioned.v1',
          updated.resourceId,
          contentFreePayload({
            action: 'transitioned',
            edge: mergeEdge,
            goal: updated,
          }),
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public createEdge(
    scope: UserScope,
    rawInput: unknown,
    context: GoalCommandContext,
  ): Promise<EdgeRecord> {
    const input = createEdgeInputV1Schema.parse(rawInput);
    if (input.edgeType === 'merged_into')
      throw new InvalidAuthorityError(
        'Merge relationships are created only by a confirmed goal transition.',
      );
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.edge_created.v1',
      );
      if (prior) {
        const payload = goalEventPayloadV1Schema.parse(prior.payload);
        if (!payload.edgeId)
          throw new ConflictError('Stored edge command result is incomplete.');
        const existing = await ports.edges.findById(scope, payload.edgeId);
        if (!existing)
          throw new ConflictError('Stored edge command target is missing.');
        return existing;
      }
      const [source, target] = await Promise.all([
        ports.resources.findById(scope, input.sourceResourceId),
        ports.resources.findById(scope, input.targetResourceId),
      ]);
      if (!source || source.deletedAt || !target || target.deletedAt)
        throw new NotFoundError('An edge resource was not found.');
      await ports.edges.acquireGraphLock(scope);
      const duplicate = await ports.edges.findActive(
        scope,
        input.sourceResourceId,
        input.targetResourceId,
        input.edgeType,
      );
      if (duplicate) throw new ConflictError('The active edge already exists.');
      if (input.edgeType === 'conflicts_with') {
        const inverse = await ports.edges.findActive(
          scope,
          input.targetResourceId,
          input.sourceResourceId,
          input.edgeType,
        );
        if (inverse)
          throw new ConflictError(
            'The symmetric conflict edge already exists.',
          );
      }
      if (
        input.edgeType === 'depends_on' &&
        wouldCreateDependencyCycle(
          input.sourceResourceId,
          input.targetResourceId,
          await ports.edges.list(scope),
        )
      )
        throw new DomainValidationError(
          'The dependency edge would create a cycle.',
        );
      const now = this.dependencies.clock.now();
      const edge: EdgeRecord = {
        createdAt: now,
        edgeType: input.edgeType,
        id: edgeIdV1Schema.parse(this.dependencies.ids.next()),
        removedAt: null,
        scope,
        sourceResourceId: input.sourceResourceId,
        targetResourceId: input.targetResourceId,
        updatedAt: now,
        version: 1,
      };
      await ports.edges.save(edge);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.edge_created.v1',
          edge.sourceResourceId,
          contentFreePayload({ action: 'edge_created', edge }),
          now,
        ),
        now,
      );
      return edge;
    });
  }

  public removeEdge(
    scope: UserScope,
    edgeId: EdgeRecord['id'],
    expectedVersion: number,
    ownerConfirmed: unknown,
    context: GoalCommandContext,
  ): Promise<EdgeRecord> {
    ownerConfirmedV1Schema.parse(ownerConfirmed);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.edge_removed.v1',
      );
      if (prior) {
        const payload = goalEventPayloadV1Schema.parse(prior.payload);
        if (!payload.edgeId)
          throw new ConflictError('Stored edge command result is incomplete.');
        const existing = await ports.edges.findById(scope, payload.edgeId);
        if (!existing)
          throw new ConflictError('Stored edge command target is missing.');
        return existing;
      }
      await ports.edges.acquireGraphLock(scope);
      const current = await ports.edges.findById(scope, edgeId);
      if (!current) throw new NotFoundError('Edge was not found.');
      if (current.removedAt)
        throw new ConflictError('Edge has already been removed.');
      if (current.edgeType === 'merged_into')
        throw new InvalidAuthorityError(
          'A merge relationship cannot be removed independently.',
        );
      if (current.version !== expectedVersion)
        throw new ConflictError('Edge version is stale.');
      const now = this.dependencies.clock.now();
      const updated = {
        ...current,
        removedAt: now,
        updatedAt: now,
        version: current.version + 1,
      };
      if (!(await ports.edges.update(updated, current.version)))
        throw new ConflictError('Edge changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.edge_removed.v1',
          updated.sourceResourceId,
          contentFreePayload({ action: 'edge_removed', edge: updated }),
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public updateSoftLimit(
    scope: UserScope,
    rawInput: unknown,
    context: GoalCommandContext,
  ): Promise<UserRecord> {
    const input = updateGoalLimitInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const prior = await acquireCommand(
        ports,
        scope,
        context,
        'goal.load_limit_updated.v1',
      );
      const current = await ports.users.findById(scope.userId);
      if (!current) throw new NotFoundError('Owner settings were not found.');
      if (prior) {
        const payload = goalEventPayloadV1Schema.parse(prior.payload);
        if (payload.activeLimit === null)
          throw new ConflictError(
            'Stored active-goal guide result is incomplete.',
          );
        return {
          ...current,
          softActiveGoalLimit: payload.activeLimit,
          updatedAt: new Date(prior.occurredAt),
        };
      }
      const now = this.dependencies.clock.now();
      const updated: UserRecord = {
        ...current,
        softActiveGoalLimit: input.softActiveGoalLimit,
        updatedAt: now,
      };
      await ports.users.save(updated);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'goal.load_limit_updated.v1',
          undefined,
          contentFreePayload({
            action: 'load_limit_updated',
            activeLimit: updated.softActiveGoalLimit,
          }),
          now,
        ),
        now,
      );
      return updated;
    });
  }
}
