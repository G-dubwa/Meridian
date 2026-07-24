import {
  calendarBlockIdV1Schema,
  schedulingCandidateV1Schema,
  schedulingIntervalV1Schema,
  schedulingProposalIdV1Schema,
  schedulingProposalStateV1Schema,
  schedulingVerdictV1Schema,
} from '@meridian/domain';
import type {
  CalendarBlockRecord,
  CalendarBlockRepository,
  SchedulingProposalRecord,
  SchedulingProposalRepository,
  UserScope,
} from '@meridian/domain';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import { calendarBlocks, schedulingProposals } from './schema.js';

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new Error('Stored scheduling explanation is invalid.');
  return value;
}

function mapProposal(
  row: typeof schedulingProposals.$inferSelect,
  scope: UserScope,
): SchedulingProposalRecord {
  return {
    alternatives: stringArray(row.alternatives),
    bufferMinutes: row.bufferMinutes,
    candidates: schedulingCandidateV1Schema.array().parse(row.candidates),
    capacityMinutes: row.capacityMinutes,
    createdAt: row.createdAt,
    deadline: row.deadline,
    earliestStart: row.earliestStart,
    estimatedEffortMinutes: row.estimatedEffortMinutes,
    exclusions: stringArray(row.exclusions),
    goalId: row.goalId as SchedulingProposalRecord['goalId'],
    id: schedulingProposalIdV1Schema.parse(row.id),
    maxBlockMinutes: row.maxBlockMinutes,
    maxDeepWorkMinutesPerDay: row.maxDeepWorkMinutesPerDay,
    minBlockMinutes: row.minBlockMinutes,
    scheduledMinutes: row.scheduledMinutes,
    scope,
    state: schedulingProposalStateV1Schema.parse(row.state),
    taskId: row.taskId as SchedulingProposalRecord['taskId'],
    timeZone: row.timeZone,
    title: row.title,
    updatedAt: row.updatedAt,
    verdict: schedulingVerdictV1Schema.parse(row.verdict),
    version: row.version,
    workingWindows: schedulingIntervalV1Schema
      .array()
      .parse(row.workingWindows)
      .map((window) => ({
        endsAt: new Date(window.endsAt),
        startsAt: new Date(window.startsAt),
      })),
  };
}

export class DrizzleSchedulingProposalRepository implements SchedulingProposalRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquirePlanningLock(scope: UserScope): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:local-planning`}))`,
    );
  }

  public async findById(
    scope: UserScope,
    id: SchedulingProposalRecord['id'],
  ): Promise<SchedulingProposalRecord | null> {
    const [row] = await this.database
      .select()
      .from(schedulingProposals)
      .where(
        and(
          eq(schedulingProposals.userId, scope.userId),
          eq(schedulingProposals.id, id),
        ),
      )
      .limit(1);
    return row ? mapProposal(row, scope) : null;
  }

  public async list(
    scope: UserScope,
  ): Promise<readonly SchedulingProposalRecord[]> {
    const rows = await this.database
      .select()
      .from(schedulingProposals)
      .where(eq(schedulingProposals.userId, scope.userId))
      .orderBy(desc(schedulingProposals.createdAt));
    return rows.map((row) => mapProposal(row, scope));
  }

  public async save(record: SchedulingProposalRecord): Promise<void> {
    await this.database.insert(schedulingProposals).values({
      alternatives: record.alternatives,
      bufferMinutes: record.bufferMinutes,
      candidates: record.candidates,
      capacityMinutes: record.capacityMinutes,
      createdAt: record.createdAt,
      deadline: record.deadline,
      earliestStart: record.earliestStart,
      estimatedEffortMinutes: record.estimatedEffortMinutes,
      exclusions: record.exclusions,
      goalId: record.goalId,
      id: record.id,
      maxBlockMinutes: record.maxBlockMinutes,
      maxDeepWorkMinutesPerDay: record.maxDeepWorkMinutesPerDay,
      minBlockMinutes: record.minBlockMinutes,
      scheduledMinutes: record.scheduledMinutes,
      state: record.state,
      taskId: record.taskId,
      timeZone: record.timeZone,
      title: record.title,
      updatedAt: record.updatedAt,
      userId: record.scope.userId,
      verdict: record.verdict,
      version: record.version,
      workingWindows: record.workingWindows.map((window) => ({
        endsAt: window.endsAt.toISOString(),
        startsAt: window.startsAt.toISOString(),
      })),
    });
  }

  public async update(
    record: SchedulingProposalRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(schedulingProposals)
      .set({
        state: record.state,
        updatedAt: record.updatedAt,
        version: record.version,
      })
      .where(
        and(
          eq(schedulingProposals.userId, record.scope.userId),
          eq(schedulingProposals.id, record.id),
          eq(schedulingProposals.version, expectedVersion),
        ),
      )
      .returning({ id: schedulingProposals.id });
    return rows.length === 1;
  }
}

function mapBlock(
  row: typeof calendarBlocks.$inferSelect,
  scope: UserScope,
): CalendarBlockRecord {
  return {
    approvalRecordedAt: row.approvalRecordedAt,
    createdAt: row.createdAt,
    currentEndsAt: row.currentEndsAt,
    currentStartsAt: row.currentStartsAt,
    goalId: row.goalId as CalendarBlockRecord['goalId'],
    id: calendarBlockIdV1Schema.parse(row.id),
    ordinal: row.ordinal,
    originalEndsAt: row.originalEndsAt,
    originalStartsAt: row.originalStartsAt,
    plannedEffortMinutes: row.plannedEffortMinutes,
    proposalId: schedulingProposalIdV1Schema.parse(row.proposalId),
    resourceId: row.id as CalendarBlockRecord['resourceId'],
    scope,
    state: row.state as CalendarBlockRecord['state'],
    taskId: row.taskId as CalendarBlockRecord['taskId'],
    timeZone: row.timeZone,
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleCalendarBlockRepository implements CalendarBlockRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: CalendarBlockRecord['id'],
  ): Promise<CalendarBlockRecord | null> {
    const [row] = await this.database
      .select()
      .from(calendarBlocks)
      .where(
        and(eq(calendarBlocks.userId, scope.userId), eq(calendarBlocks.id, id)),
      )
      .limit(1);
    return row ? mapBlock(row, scope) : null;
  }

  public async listBetween(
    scope: UserScope,
    start: Date,
    end: Date,
  ): Promise<readonly CalendarBlockRecord[]> {
    const rows = await this.database
      .select()
      .from(calendarBlocks)
      .where(
        and(
          eq(calendarBlocks.userId, scope.userId),
          lt(calendarBlocks.currentStartsAt, end),
          gt(calendarBlocks.currentEndsAt, start),
        ),
      )
      .orderBy(asc(calendarBlocks.currentStartsAt));
    return rows.map((row) => mapBlock(row, scope));
  }

  public async listForProposal(
    scope: UserScope,
    proposalId: SchedulingProposalRecord['id'],
  ): Promise<readonly CalendarBlockRecord[]> {
    const rows = await this.database
      .select()
      .from(calendarBlocks)
      .where(
        and(
          eq(calendarBlocks.userId, scope.userId),
          eq(calendarBlocks.proposalId, proposalId),
        ),
      )
      .orderBy(asc(calendarBlocks.ordinal));
    return rows.map((row) => mapBlock(row, scope));
  }

  public async save(record: CalendarBlockRecord): Promise<void> {
    if (String(record.id) !== String(record.resourceId))
      throw new Error('Calendar block id must equal its resource id.');
    await this.database.insert(calendarBlocks).values({
      approvalRecordedAt: record.approvalRecordedAt,
      createdAt: record.createdAt,
      currentEndsAt: record.currentEndsAt,
      currentStartsAt: record.currentStartsAt,
      goalId: record.goalId,
      id: record.id,
      ordinal: record.ordinal,
      originalEndsAt: record.originalEndsAt,
      originalStartsAt: record.originalStartsAt,
      plannedEffortMinutes: record.plannedEffortMinutes,
      proposalId: record.proposalId,
      state: record.state,
      taskId: record.taskId,
      timeZone: record.timeZone,
      title: record.title,
      updatedAt: record.updatedAt,
      userId: record.scope.userId,
      version: record.version,
    });
  }
}
