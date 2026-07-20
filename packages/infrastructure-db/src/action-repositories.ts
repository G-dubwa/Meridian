import {
  recurrenceRuleV1Schema,
  reminderIdV1Schema,
  reminderOccurrenceIdV1Schema,
  taskIdV1Schema,
} from '@meridian/domain';
import type {
  CommandReceiptRecord,
  CommandReceiptRepository,
  ReminderOccurrenceRecord,
  ReminderOccurrenceId,
  ReminderOccurrenceRepository,
  ReminderRecord,
  ReminderRepository,
  TaskRecord,
  TaskRepository,
  UserScope,
} from '@meridian/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import {
  commandReceipts,
  reminderOccurrences,
  reminders,
  tasks,
} from './schema.js';

function mapTask(row: typeof tasks.$inferSelect, scope: UserScope): TaskRecord {
  return {
    createdAt: row.createdAt,
    creationAuthority: row.creationAuthority as TaskRecord['creationAuthority'],
    dueAt: row.dueAt,
    estimateMinutes: row.estimateMinutes,
    goalResourceId: row.goalResourceId as TaskRecord['goalResourceId'],
    id: taskIdV1Schema.parse(row.id),
    kind: row.kind as TaskRecord['kind'],
    notes: row.notes,
    resourceId: row.id as TaskRecord['resourceId'],
    scope,
    sourceProposalId: row.sourceProposalId as TaskRecord['sourceProposalId'],
    state: row.state as TaskRecord['state'],
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleTaskRepository implements TaskRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: TaskRecord['id'],
  ): Promise<TaskRecord | null> {
    const [row] = await this.database
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, scope.userId), eq(tasks.id, id)))
      .limit(1);
    return row ? mapTask(row, scope) : null;
  }

  public async list(scope: UserScope): Promise<readonly TaskRecord[]> {
    const rows = await this.database
      .select()
      .from(tasks)
      .where(eq(tasks.userId, scope.userId))
      .orderBy(desc(tasks.updatedAt));
    return rows.map((row) => mapTask(row, scope));
  }

  public async save(task: TaskRecord): Promise<void> {
    if (String(task.id) !== String(task.resourceId))
      throw new Error('Task id must equal its canonical resource id.');
    await this.database.insert(tasks).values({
      createdAt: task.createdAt,
      creationAuthority: task.creationAuthority,
      dueAt: task.dueAt,
      estimateMinutes: task.estimateMinutes,
      goalResourceId: task.goalResourceId,
      id: task.id,
      kind: task.kind,
      notes: task.notes,
      sourceProposalId: task.sourceProposalId,
      state: task.state,
      title: task.title,
      updatedAt: task.updatedAt,
      userId: task.scope.userId,
      version: task.version,
    });
  }

  public async update(
    task: TaskRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(tasks)
      .set({
        dueAt: task.dueAt,
        estimateMinutes: task.estimateMinutes,
        goalResourceId: task.goalResourceId,
        kind: task.kind,
        notes: task.notes,
        state: task.state,
        title: task.title,
        updatedAt: task.updatedAt,
        version: task.version,
      })
      .where(
        and(
          eq(tasks.id, task.id),
          eq(tasks.userId, task.scope.userId),
          eq(tasks.version, expectedVersion),
        ),
      )
      .returning({ id: tasks.id });
    return rows.length === 1;
  }
}

function mapReminder(
  row: typeof reminders.$inferSelect,
  scope: UserScope,
): ReminderRecord {
  return {
    createdAt: row.createdAt,
    creationAuthority:
      row.creationAuthority as ReminderRecord['creationAuthority'],
    deliveryPolicy: row.deliveryPolicy as 'undecided',
    expiresAt: row.expiresAt,
    id: reminderIdV1Schema.parse(row.id),
    ownerFeedback: row.ownerFeedback,
    priority: row.priority as ReminderRecord['priority'],
    purpose: row.purpose,
    quietHoursBehavior: row.quietHoursBehavior as 'defer',
    recurrence:
      row.recurrence === null
        ? null
        : recurrenceRuleV1Schema.parse(row.recurrence),
    relatedResourceId:
      row.relatedResourceId as ReminderRecord['relatedResourceId'],
    resourceId: row.id as ReminderRecord['resourceId'],
    scope,
    sourceProposalId:
      row.sourceProposalId as ReminderRecord['sourceProposalId'],
    state: row.state as ReminderRecord['state'],
    timeZone: row.timeZone,
    triggerAt: row.triggerAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleReminderRepository implements ReminderRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: ReminderRecord['id'],
  ): Promise<ReminderRecord | null> {
    const [row] = await this.database
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, scope.userId), eq(reminders.id, id)))
      .limit(1);
    return row ? mapReminder(row, scope) : null;
  }

  public async list(scope: UserScope): Promise<readonly ReminderRecord[]> {
    const rows = await this.database
      .select()
      .from(reminders)
      .where(eq(reminders.userId, scope.userId))
      .orderBy(desc(reminders.triggerAt));
    return rows.map((row) => mapReminder(row, scope));
  }

  public async save(reminder: ReminderRecord): Promise<void> {
    if (String(reminder.id) !== String(reminder.resourceId))
      throw new Error('Reminder id must equal its canonical resource id.');
    await this.database.insert(reminders).values({
      createdAt: reminder.createdAt,
      creationAuthority: reminder.creationAuthority,
      deliveryPolicy: reminder.deliveryPolicy,
      expiresAt: reminder.expiresAt,
      id: reminder.id,
      ownerFeedback: reminder.ownerFeedback,
      priority: reminder.priority,
      purpose: reminder.purpose,
      quietHoursBehavior: reminder.quietHoursBehavior,
      recurrence: reminder.recurrence,
      relatedResourceId: reminder.relatedResourceId,
      sourceProposalId: reminder.sourceProposalId,
      state: reminder.state,
      timeZone: reminder.timeZone,
      triggerAt: reminder.triggerAt,
      updatedAt: reminder.updatedAt,
      userId: reminder.scope.userId,
      version: reminder.version,
    });
  }

  public async update(
    reminder: ReminderRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(reminders)
      .set({
        expiresAt: reminder.expiresAt,
        ownerFeedback: reminder.ownerFeedback,
        priority: reminder.priority,
        purpose: reminder.purpose,
        recurrence: reminder.recurrence,
        relatedResourceId: reminder.relatedResourceId,
        state: reminder.state,
        timeZone: reminder.timeZone,
        triggerAt: reminder.triggerAt,
        updatedAt: reminder.updatedAt,
        version: reminder.version,
      })
      .where(
        and(
          eq(reminders.id, reminder.id),
          eq(reminders.userId, reminder.scope.userId),
          eq(reminders.version, expectedVersion),
        ),
      )
      .returning({ id: reminders.id });
    return rows.length === 1;
  }
}

export class DrizzleReminderOccurrenceRepository implements ReminderOccurrenceRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: ReminderOccurrenceId,
  ): Promise<ReminderOccurrenceRecord | null> {
    const [row] = await this.database
      .select()
      .from(reminderOccurrences)
      .where(
        and(
          eq(reminderOccurrences.userId, scope.userId),
          eq(reminderOccurrences.id, id),
        ),
      )
      .limit(1);
    return row
      ? {
          createdAt: row.createdAt,
          id: reminderOccurrenceIdV1Schema.parse(row.id),
          reminderId: reminderIdV1Schema.parse(row.reminderId),
          scheduledFor: row.scheduledFor,
          scope,
          state: row.state as ReminderOccurrenceRecord['state'],
          updatedAt: row.updatedAt,
        }
      : null;
  }

  public async save(occurrence: ReminderOccurrenceRecord): Promise<void> {
    await this.database.insert(reminderOccurrences).values({
      createdAt: occurrence.createdAt,
      id: occurrence.id,
      reminderId: occurrence.reminderId,
      scheduledFor: occurrence.scheduledFor,
      state: occurrence.state,
      updatedAt: occurrence.updatedAt,
      userId: occurrence.scope.userId,
    });
  }

  public async cancelPending(
    scope: UserScope,
    reminderId: ReminderRecord['id'],
    at: Date,
  ): Promise<void> {
    await this.database
      .update(reminderOccurrences)
      .set({ state: 'cancelled', updatedAt: at })
      .where(
        and(
          eq(reminderOccurrences.userId, scope.userId),
          eq(reminderOccurrences.reminderId, reminderId),
          eq(reminderOccurrences.state, 'pending'),
        ),
      );
  }
}

function mapReceipt(
  row: typeof commandReceipts.$inferSelect,
  scope: UserScope,
): CommandReceiptRecord {
  return {
    createdAt: row.createdAt,
    id: row.id as CommandReceiptRecord['id'],
    scope,
    status: row.status as CommandReceiptRecord['status'],
    targetResourceId:
      row.targetResourceId as CommandReceiptRecord['targetResourceId'],
    targetType: row.targetType as CommandReceiptRecord['targetType'],
    undoneAt: row.undoneAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class DrizzleCommandReceiptRepository implements CommandReceiptRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: CommandReceiptRecord['id'],
  ): Promise<CommandReceiptRecord | null> {
    const [row] = await this.database
      .select()
      .from(commandReceipts)
      .where(
        and(
          eq(commandReceipts.userId, scope.userId),
          eq(commandReceipts.id, id),
        ),
      )
      .limit(1);
    return row ? mapReceipt(row, scope) : null;
  }

  public async save(receipt: CommandReceiptRecord): Promise<void> {
    await this.database.insert(commandReceipts).values({
      createdAt: receipt.createdAt,
      id: receipt.id,
      status: receipt.status,
      targetResourceId: receipt.targetResourceId,
      targetType: receipt.targetType,
      undoneAt: receipt.undoneAt,
      updatedAt: receipt.updatedAt,
      userId: receipt.scope.userId,
      version: receipt.version,
    });
  }

  public async update(
    receipt: CommandReceiptRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(commandReceipts)
      .set({
        status: receipt.status,
        undoneAt: receipt.undoneAt,
        updatedAt: receipt.updatedAt,
        version: receipt.version,
      })
      .where(
        and(
          eq(commandReceipts.id, receipt.id),
          eq(commandReceipts.userId, receipt.scope.userId),
          eq(commandReceipts.version, expectedVersion),
        ),
      )
      .returning({ id: commandReceipts.id });
    return rows.length === 1;
  }
}
