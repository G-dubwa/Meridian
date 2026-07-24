import { z } from 'zod';

export const uuidV1Schema = z.uuid().brand<'Uuid'>();
export type Uuid = z.infer<typeof uuidV1Schema>;

export const userIdV1Schema = z.uuid().brand<'UserId'>();
export type UserId = z.infer<typeof userIdV1Schema>;
export const resourceIdV1Schema = z.uuid().brand<'ResourceId'>();
export type ResourceId = z.infer<typeof resourceIdV1Schema>;
export const entryIdV1Schema = z.uuid().brand<'EntryId'>();
export type EntryId = z.infer<typeof entryIdV1Schema>;
export const entryRevisionIdV1Schema = z.uuid().brand<'EntryRevisionId'>();
export type EntryRevisionId = z.infer<typeof entryRevisionIdV1Schema>;
export const domainEventIdV1Schema = z.uuid().brand<'DomainEventId'>();
export type DomainEventId = z.infer<typeof domainEventIdV1Schema>;
export const outboxMessageIdV1Schema = z.uuid().brand<'OutboxMessageId'>();
export type OutboxMessageId = z.infer<typeof outboxMessageIdV1Schema>;
export const derivationLinkIdV1Schema = z.uuid().brand<'DerivationLinkId'>();
export type DerivationLinkId = z.infer<typeof derivationLinkIdV1Schema>;
export const proposalIdV1Schema = z.uuid().brand<'ProposalId'>();
export type ProposalId = z.infer<typeof proposalIdV1Schema>;
export const taskIdV1Schema = z.uuid().brand<'TaskId'>();
export type TaskId = z.infer<typeof taskIdV1Schema>;
export const reminderIdV1Schema = z.uuid().brand<'ReminderId'>();
export type ReminderId = z.infer<typeof reminderIdV1Schema>;
export const reminderOccurrenceIdV1Schema = z
  .uuid()
  .brand<'ReminderOccurrenceId'>();
export type ReminderOccurrenceId = z.infer<typeof reminderOccurrenceIdV1Schema>;
export const commandReceiptIdV1Schema = z.uuid().brand<'CommandReceiptId'>();
export type CommandReceiptId = z.infer<typeof commandReceiptIdV1Schema>;
export const agendaBlockIdV1Schema = z.uuid().brand<'AgendaBlockId'>();
export type AgendaBlockId = z.infer<typeof agendaBlockIdV1Schema>;
export const schedulingProposalIdV1Schema = z
  .uuid()
  .brand<'SchedulingProposalId'>();
export type SchedulingProposalId = z.infer<typeof schedulingProposalIdV1Schema>;
export const calendarBlockIdV1Schema = z.uuid().brand<'CalendarBlockId'>();
export type CalendarBlockId = z.infer<typeof calendarBlockIdV1Schema>;
export const executionRecordIdV1Schema = z.uuid().brand<'ExecutionRecordId'>();
export type ExecutionRecordId = z.infer<typeof executionRecordIdV1Schema>;
export const dailyPriorityIdV1Schema = z.uuid().brand<'DailyPriorityId'>();
export type DailyPriorityId = z.infer<typeof dailyPriorityIdV1Schema>;
export const todayReceiptIdV1Schema = z.uuid().brand<'TodayReceiptId'>();
export type TodayReceiptId = z.infer<typeof todayReceiptIdV1Schema>;
export const goalIdV1Schema = z.uuid().brand<'GoalId'>();
export type GoalId = z.infer<typeof goalIdV1Schema>;
export const edgeIdV1Schema = z.uuid().brand<'EdgeId'>();
export type EdgeId = z.infer<typeof edgeIdV1Schema>;
export const sessionIdV1Schema = z.uuid().brand<'SessionId'>();
export type SessionId = z.infer<typeof sessionIdV1Schema>;

export const idSchemasV1 = {
  agendaBlockId: agendaBlockIdV1Schema,
  calendarBlockId: calendarBlockIdV1Schema,
  commandReceiptId: commandReceiptIdV1Schema,
  dailyPriorityId: dailyPriorityIdV1Schema,
  derivationLinkId: derivationLinkIdV1Schema,
  domainEventId: domainEventIdV1Schema,
  entryId: entryIdV1Schema,
  entryRevisionId: entryRevisionIdV1Schema,
  edgeId: edgeIdV1Schema,
  executionRecordId: executionRecordIdV1Schema,
  goalId: goalIdV1Schema,
  outboxMessageId: outboxMessageIdV1Schema,
  proposalId: proposalIdV1Schema,
  taskId: taskIdV1Schema,
  reminderId: reminderIdV1Schema,
  reminderOccurrenceId: reminderOccurrenceIdV1Schema,
  resourceId: resourceIdV1Schema,
  sessionId: sessionIdV1Schema,
  schedulingProposalId: schedulingProposalIdV1Schema,
  todayReceiptId: todayReceiptIdV1Schema,
  userId: userIdV1Schema,
  uuid: uuidV1Schema,
} as const;
