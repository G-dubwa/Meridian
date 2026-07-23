import {
  edgeIdV1Schema,
  edgeTypeV1Schema,
  goalIdV1Schema,
  goalStateV1Schema,
  goalTypeV1Schema,
} from '@meridian/domain';
import type {
  EdgeRecord,
  EdgeRepository,
  GoalRecord,
  GoalRepository,
  UserScope,
} from '@meridian/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import { edges, goals } from './schema.js';

function mapGoal(row: typeof goals.$inferSelect, scope: UserScope): GoalRecord {
  return {
    createdAt: row.createdAt,
    creationAuthority: row.creationAuthority as GoalRecord['creationAuthority'],
    id: goalIdV1Schema.parse(row.id),
    lifeDomain: row.lifeDomain,
    narrative: row.narrative,
    resourceId: row.id as GoalRecord['resourceId'],
    scope,
    sourceProposalId: row.sourceProposalId as GoalRecord['sourceProposalId'],
    state: goalStateV1Schema.parse(row.state),
    successCriteria: row.successCriteria,
    targetDate: row.targetDate,
    title: row.title,
    type: goalTypeV1Schema.parse(row.type),
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleGoalRepository implements GoalRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquireActiveGoalLock(scope: UserScope): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:active-goals`}))`,
    );
  }

  public async findById(
    scope: UserScope,
    id: GoalRecord['id'],
  ): Promise<GoalRecord | null> {
    const [row] = await this.database
      .select()
      .from(goals)
      .where(and(eq(goals.userId, scope.userId), eq(goals.id, id)))
      .limit(1);
    return row ? mapGoal(row, scope) : null;
  }

  public async list(scope: UserScope): Promise<readonly GoalRecord[]> {
    const rows = await this.database
      .select()
      .from(goals)
      .where(eq(goals.userId, scope.userId))
      .orderBy(desc(goals.updatedAt));
    return rows.map((row) => mapGoal(row, scope));
  }

  public async save(goal: GoalRecord): Promise<void> {
    if (String(goal.id) !== String(goal.resourceId))
      throw new Error('Goal id must equal its resource id.');
    await this.database.insert(goals).values({
      createdAt: goal.createdAt,
      creationAuthority: goal.creationAuthority,
      id: goal.id,
      lifeDomain: goal.lifeDomain,
      narrative: goal.narrative,
      sourceProposalId: goal.sourceProposalId,
      state: goal.state,
      successCriteria: goal.successCriteria,
      targetDate: goal.targetDate,
      title: goal.title,
      type: goal.type,
      updatedAt: goal.updatedAt,
      userId: goal.scope.userId,
      version: goal.version,
    });
  }

  public async update(
    goal: GoalRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(goals)
      .set({
        lifeDomain: goal.lifeDomain,
        narrative: goal.narrative,
        state: goal.state,
        successCriteria: goal.successCriteria,
        targetDate: goal.targetDate,
        title: goal.title,
        type: goal.type,
        updatedAt: goal.updatedAt,
        version: goal.version,
      })
      .where(
        and(
          eq(goals.userId, goal.scope.userId),
          eq(goals.id, goal.id),
          eq(goals.version, expectedVersion),
        ),
      )
      .returning({ id: goals.id });
    return rows.length === 1;
  }
}

function mapEdge(row: typeof edges.$inferSelect, scope: UserScope): EdgeRecord {
  return {
    createdAt: row.createdAt,
    edgeType: edgeTypeV1Schema.parse(row.edgeType),
    id: edgeIdV1Schema.parse(row.id),
    removedAt: row.removedAt,
    scope,
    sourceResourceId: row.sourceResourceId as EdgeRecord['sourceResourceId'],
    targetResourceId: row.targetResourceId as EdgeRecord['targetResourceId'],
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleEdgeRepository implements EdgeRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquireGraphLock(scope: UserScope): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:resource-edges`}))`,
    );
  }

  public async findById(
    scope: UserScope,
    id: EdgeRecord['id'],
  ): Promise<EdgeRecord | null> {
    const [row] = await this.database
      .select()
      .from(edges)
      .where(and(eq(edges.userId, scope.userId), eq(edges.id, id)))
      .limit(1);
    return row ? mapEdge(row, scope) : null;
  }

  public async findActive(
    scope: UserScope,
    sourceResourceId: EdgeRecord['sourceResourceId'],
    targetResourceId: EdgeRecord['targetResourceId'],
    edgeType: EdgeRecord['edgeType'],
  ): Promise<EdgeRecord | null> {
    const [row] = await this.database
      .select()
      .from(edges)
      .where(
        and(
          eq(edges.userId, scope.userId),
          eq(edges.sourceResourceId, sourceResourceId),
          eq(edges.targetResourceId, targetResourceId),
          eq(edges.edgeType, edgeType),
          isNull(edges.removedAt),
        ),
      )
      .limit(1);
    return row ? mapEdge(row, scope) : null;
  }

  public async list(scope: UserScope): Promise<readonly EdgeRecord[]> {
    const rows = await this.database
      .select()
      .from(edges)
      .where(and(eq(edges.userId, scope.userId), isNull(edges.removedAt)))
      .orderBy(desc(edges.createdAt));
    return rows.map((row) => mapEdge(row, scope));
  }

  public async save(edge: EdgeRecord): Promise<void> {
    await this.database.insert(edges).values({
      createdAt: edge.createdAt,
      edgeType: edge.edgeType,
      id: edge.id,
      removedAt: edge.removedAt,
      sourceResourceId: edge.sourceResourceId,
      targetResourceId: edge.targetResourceId,
      updatedAt: edge.updatedAt,
      userId: edge.scope.userId,
      version: edge.version,
    });
  }

  public async update(
    edge: EdgeRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(edges)
      .set({
        removedAt: edge.removedAt,
        updatedAt: edge.updatedAt,
        version: edge.version,
      })
      .where(
        and(
          eq(edges.userId, edge.scope.userId),
          eq(edges.id, edge.id),
          eq(edges.version, expectedVersion),
        ),
      )
      .returning({ id: edges.id });
    return rows.length === 1;
  }
}
