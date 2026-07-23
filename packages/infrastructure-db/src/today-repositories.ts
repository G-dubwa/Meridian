import {
  agendaBlockIdV1Schema,
  agendaBlockStateV1Schema,
  dailyPriorityIdV1Schema,
  localDateV1Schema,
  taskIdV1Schema,
  todayLifecycleActionV1Schema,
  todayReceiptIdV1Schema,
  todayTargetTypeV1Schema,
} from '@meridian/domain';
import type {
  AgendaBlockRecord,
  AgendaBlockRepository,
  DailyPriorityRecord,
  DailyPriorityRepository,
  TodayReceiptRecord,
  TodayReceiptRepository,
  UserScope,
} from '@meridian/domain';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import { agendaBlocks, dailyPriorities, todayReceipts } from './schema.js';

function mapAgenda(
  row: typeof agendaBlocks.$inferSelect,
  scope: UserScope,
): AgendaBlockRecord {
  return {
    createdAt: row.createdAt,
    endsAt: row.endsAt,
    id: agendaBlockIdV1Schema.parse(row.id),
    notes: row.notes,
    resourceId: row.id as AgendaBlockRecord['resourceId'],
    scope,
    startsAt: row.startsAt,
    state: agendaBlockStateV1Schema.parse(row.state),
    timeZone: row.timeZone,
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleAgendaBlockRepository implements AgendaBlockRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: AgendaBlockRecord['id'],
  ): Promise<AgendaBlockRecord | null> {
    const [row] = await this.database
      .select()
      .from(agendaBlocks)
      .where(
        and(eq(agendaBlocks.userId, scope.userId), eq(agendaBlocks.id, id)),
      )
      .limit(1);
    return row ? mapAgenda(row, scope) : null;
  }

  public async listBetween(
    scope: UserScope,
    start: Date,
    end: Date,
  ): Promise<readonly AgendaBlockRecord[]> {
    const rows = await this.database
      .select()
      .from(agendaBlocks)
      .where(
        and(
          eq(agendaBlocks.userId, scope.userId),
          lt(agendaBlocks.startsAt, end),
          gt(agendaBlocks.endsAt, start),
        ),
      )
      .orderBy(asc(agendaBlocks.startsAt));
    return rows.map((row) => mapAgenda(row, scope));
  }

  public async save(record: AgendaBlockRecord): Promise<void> {
    if (String(record.id) !== String(record.resourceId))
      throw new Error('Agenda block id must equal its resource id.');
    await this.database.insert(agendaBlocks).values({
      createdAt: record.createdAt,
      endsAt: record.endsAt,
      id: record.id,
      notes: record.notes,
      startsAt: record.startsAt,
      state: record.state,
      timeZone: record.timeZone,
      title: record.title,
      updatedAt: record.updatedAt,
      userId: record.scope.userId,
      version: record.version,
    });
  }

  public async update(
    record: AgendaBlockRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(agendaBlocks)
      .set({
        endsAt: record.endsAt,
        notes: record.notes,
        startsAt: record.startsAt,
        state: record.state,
        timeZone: record.timeZone,
        title: record.title,
        updatedAt: record.updatedAt,
        version: record.version,
      })
      .where(
        and(
          eq(agendaBlocks.id, record.id),
          eq(agendaBlocks.userId, record.scope.userId),
          eq(agendaBlocks.version, expectedVersion),
        ),
      )
      .returning({ id: agendaBlocks.id });
    return rows.length === 1;
  }
}

function mapPriority(
  row: typeof dailyPriorities.$inferSelect,
  scope: UserScope,
): DailyPriorityRecord {
  return {
    createdAt: row.createdAt,
    id: dailyPriorityIdV1Schema.parse(row.id),
    localDate: localDateV1Schema.parse(row.localDate),
    position: row.position as 1 | 2 | 3,
    scope,
    taskId: taskIdV1Schema.parse(row.taskId),
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleDailyPriorityRepository implements DailyPriorityRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquireDateLock(
    scope: UserScope,
    localDate: DailyPriorityRecord['localDate'],
  ): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:${localDate}:daily-priorities`}))`,
    );
  }

  public async findById(
    scope: UserScope,
    id: DailyPriorityRecord['id'],
  ): Promise<DailyPriorityRecord | null> {
    const [row] = await this.database
      .select()
      .from(dailyPriorities)
      .where(
        and(
          eq(dailyPriorities.userId, scope.userId),
          eq(dailyPriorities.id, id),
        ),
      )
      .limit(1);
    return row ? mapPriority(row, scope) : null;
  }

  public async listForDate(
    scope: UserScope,
    localDate: DailyPriorityRecord['localDate'],
  ): Promise<readonly DailyPriorityRecord[]> {
    const rows = await this.database
      .select()
      .from(dailyPriorities)
      .where(
        and(
          eq(dailyPriorities.userId, scope.userId),
          eq(dailyPriorities.localDate, localDate),
        ),
      )
      .orderBy(asc(dailyPriorities.position));
    return rows.map((row) => mapPriority(row, scope));
  }

  public async save(record: DailyPriorityRecord): Promise<void> {
    await this.database.insert(dailyPriorities).values({
      createdAt: record.createdAt,
      id: record.id,
      localDate: record.localDate,
      position: record.position,
      taskId: record.taskId,
      updatedAt: record.updatedAt,
      userId: record.scope.userId,
      version: record.version,
    });
  }

  public async delete(
    scope: UserScope,
    id: DailyPriorityRecord['id'],
  ): Promise<boolean> {
    const rows = await this.database
      .delete(dailyPriorities)
      .where(
        and(
          eq(dailyPriorities.userId, scope.userId),
          eq(dailyPriorities.id, id),
        ),
      )
      .returning({ id: dailyPriorities.id });
    return rows.length === 1;
  }
}

function mapReceipt(
  row: typeof todayReceipts.$inferSelect,
  scope: UserScope,
): TodayReceiptRecord {
  return {
    action: todayLifecycleActionV1Schema.parse(row.action),
    createdAt: row.createdAt,
    effectId:
      row.effectId === null
        ? null
        : dailyPriorityIdV1Schema.parse(row.effectId),
    id: todayReceiptIdV1Schema.parse(row.id),
    priorState: row.priorState,
    resultingVersion: row.resultingVersion,
    scope,
    status: row.status as TodayReceiptRecord['status'],
    targetResourceId:
      row.targetResourceId as TodayReceiptRecord['targetResourceId'],
    targetType: todayTargetTypeV1Schema.parse(row.targetType),
    undoneAt: row.undoneAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleTodayReceiptRepository implements TodayReceiptRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: TodayReceiptRecord['id'],
  ): Promise<TodayReceiptRecord | null> {
    const [row] = await this.database
      .select()
      .from(todayReceipts)
      .where(
        and(eq(todayReceipts.userId, scope.userId), eq(todayReceipts.id, id)),
      )
      .limit(1);
    return row ? mapReceipt(row, scope) : null;
  }

  public async save(record: TodayReceiptRecord): Promise<void> {
    await this.database.insert(todayReceipts).values({
      action: record.action,
      createdAt: record.createdAt,
      effectId: record.effectId,
      id: record.id,
      priorState: record.priorState,
      resultingVersion: record.resultingVersion,
      status: record.status,
      targetResourceId: record.targetResourceId,
      targetType: record.targetType,
      undoneAt: record.undoneAt,
      updatedAt: record.updatedAt,
      userId: record.scope.userId,
      version: record.version,
    });
  }

  public async update(
    record: TodayReceiptRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(todayReceipts)
      .set({
        status: record.status,
        undoneAt: record.undoneAt,
        updatedAt: record.updatedAt,
        version: record.version,
      })
      .where(
        and(
          eq(todayReceipts.userId, record.scope.userId),
          eq(todayReceipts.id, record.id),
          eq(todayReceipts.version, expectedVersion),
        ),
      )
      .returning({ id: todayReceipts.id });
    return rows.length === 1;
  }
}
