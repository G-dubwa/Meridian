import type {
  TransactionManager,
  TransactionPorts,
  UserScope,
} from '@meridian/domain';
import { sql } from 'drizzle-orm';
import type { DatabaseClient } from './client.js';
import {
  DrizzleCommandReceiptRepository,
  DrizzleReminderOccurrenceRepository,
  DrizzleReminderRepository,
  DrizzleTaskRepository,
} from './action-repositories.js';
import {
  DrizzleConsentRecordRepository,
  DrizzleIntegrationAccountRepository,
} from './integration-repositories.js';
import {
  DrizzleDerivationLinkRepository,
  DrizzleDomainEventRepository,
  DrizzleEntryRepository,
  DrizzleEntryRevisionRepository,
  DrizzleOutboxRepository,
  DrizzleProposalRepository,
  DrizzleResourceRepository,
  DrizzleUserRepository,
  type DatabaseTransaction,
} from './repositories.js';
import {
  DrizzleAgendaBlockRepository,
  DrizzleDailyPriorityRepository,
  DrizzleTodayReceiptRepository,
} from './today-repositories.js';
import {
  DrizzleEdgeRepository,
  DrizzleGoalRepository,
} from './goal-repositories.js';
import {
  DrizzleCalendarBlockRepository,
  DrizzleSchedulingProposalRepository,
} from './scheduling-repositories.js';
import { DrizzleExecutionRecordRepository } from './execution-repositories.js';

function createTransactionPorts(
  database: DatabaseTransaction,
): TransactionPorts {
  return {
    agendaBlocks: new DrizzleAgendaBlockRepository(database),
    calendarBlocks: new DrizzleCalendarBlockRepository(database),
    commandReceipts: new DrizzleCommandReceiptRepository(database),
    consentRecords: new DrizzleConsentRecordRepository(database),
    dailyPriorities: new DrizzleDailyPriorityRepository(database),
    derivationLinks: new DrizzleDerivationLinkRepository(database),
    domainEvents: new DrizzleDomainEventRepository(database),
    edges: new DrizzleEdgeRepository(database),
    executionRecords: new DrizzleExecutionRecordRepository(database),
    entries: new DrizzleEntryRepository(database),
    entryRevisions: new DrizzleEntryRevisionRepository(database),
    integrationAccounts: new DrizzleIntegrationAccountRepository(database),
    goals: new DrizzleGoalRepository(database),
    outbox: new DrizzleOutboxRepository(database),
    proposals: new DrizzleProposalRepository(database),
    reminderOccurrences: new DrizzleReminderOccurrenceRepository(database),
    reminders: new DrizzleReminderRepository(database),
    schedulingProposals: new DrizzleSchedulingProposalRepository(database),
    resources: new DrizzleResourceRepository(database),
    tasks: new DrizzleTaskRepository(database),
    todayReceipts: new DrizzleTodayReceiptRepository(database),
    users: new DrizzleUserRepository(database),
  };
}

export class DrizzleTransactionManager implements TransactionManager {
  public constructor(private readonly database: DatabaseClient) {}

  public run<T>(
    scope: UserScope,
    operation: (ports: TransactionPorts) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('meridian.user_id', ${scope.userId}, true)`,
      );
      return operation(createTransactionPorts(transaction));
    });
  }
}
