import {
  executionConfidenceClassV1Schema,
  executionEvidenceTypeV1Schema,
  executionOutcomeV1Schema,
  executionRecordIdV1Schema,
  executionSourceV1Schema,
} from '@meridian/domain';
import type {
  ExecutionRecord,
  ExecutionRecordRepository,
  UserScope,
} from '@meridian/domain';
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import { executionRecords } from './schema.js';

function mapRecord(
  row: typeof executionRecords.$inferSelect,
  scope: UserScope,
): ExecutionRecord {
  return {
    calendarBlockId: row.calendarBlockId as ExecutionRecord['calendarBlockId'],
    confidenceClass: executionConfidenceClassV1Schema.parse(
      row.confidenceClass,
    ),
    evidenceType: executionEvidenceTypeV1Schema.parse(row.evidenceType),
    id: executionRecordIdV1Schema.parse(row.id),
    occurredAt: row.occurredAt,
    outcome: executionOutcomeV1Schema.parse(row.outcome),
    recordedAt: row.recordedAt,
    reportedDurationMinutes: row.reportedDurationMinutes,
    retractedAt: row.retractedAt,
    retractionReason:
      row.retractionReason as ExecutionRecord['retractionReason'],
    scope,
    source: executionSourceV1Schema.parse(row.source),
    sourceReceiptId: row.sourceReceiptId as ExecutionRecord['sourceReceiptId'],
    taskId: row.taskId as ExecutionRecord['taskId'],
  };
}

export class DrizzleExecutionRecordRepository implements ExecutionRecordRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquireEvidenceLock(scope: UserScope): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:execution-evidence`}))`,
    );
  }

  public async findActiveForBlock(
    scope: UserScope,
    blockId: NonNullable<ExecutionRecord['calendarBlockId']>,
  ): Promise<ExecutionRecord | null> {
    const [row] = await this.database
      .select()
      .from(executionRecords)
      .where(
        and(
          eq(executionRecords.userId, scope.userId),
          eq(executionRecords.calendarBlockId, blockId),
          isNull(executionRecords.retractedAt),
        ),
      )
      .limit(1);
    return row ? mapRecord(row, scope) : null;
  }

  public async findBySourceReceipt(
    scope: UserScope,
    receiptId: NonNullable<ExecutionRecord['sourceReceiptId']>,
  ): Promise<ExecutionRecord | null> {
    const [row] = await this.database
      .select()
      .from(executionRecords)
      .where(
        and(
          eq(executionRecords.userId, scope.userId),
          eq(executionRecords.sourceReceiptId, receiptId),
        ),
      )
      .limit(1);
    return row ? mapRecord(row, scope) : null;
  }

  public async listBetween(
    scope: UserScope,
    start: Date,
    end: Date,
  ): Promise<readonly ExecutionRecord[]> {
    const rows = await this.database
      .select()
      .from(executionRecords)
      .where(
        and(
          eq(executionRecords.userId, scope.userId),
          gte(executionRecords.occurredAt, start),
          lt(executionRecords.occurredAt, end),
        ),
      )
      .orderBy(asc(executionRecords.occurredAt));
    return rows.map((row) => mapRecord(row, scope));
  }

  public async save(record: ExecutionRecord): Promise<void> {
    await this.database.insert(executionRecords).values({
      calendarBlockId: record.calendarBlockId,
      confidenceClass: record.confidenceClass,
      evidenceType: record.evidenceType,
      id: record.id,
      occurredAt: record.occurredAt,
      outcome: record.outcome,
      recordedAt: record.recordedAt,
      reportedDurationMinutes: record.reportedDurationMinutes,
      retractedAt: record.retractedAt,
      retractionReason: record.retractionReason,
      source: record.source,
      sourceReceiptId: record.sourceReceiptId,
      taskId: record.taskId,
      userId: record.scope.userId,
    });
  }

  public async retractForReceipt(
    scope: UserScope,
    receiptId: NonNullable<ExecutionRecord['sourceReceiptId']>,
    at: Date,
  ): Promise<ExecutionRecord | null> {
    const [row] = await this.database
      .update(executionRecords)
      .set({ retractedAt: at, retractionReason: 'owner_undo' })
      .where(
        and(
          eq(executionRecords.userId, scope.userId),
          eq(executionRecords.sourceReceiptId, receiptId),
          isNull(executionRecords.retractedAt),
        ),
      )
      .returning();
    return row ? mapRecord(row, scope) : null;
  }
}
