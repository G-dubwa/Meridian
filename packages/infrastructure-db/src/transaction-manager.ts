import type {
  TransactionManager,
  TransactionPorts,
  UserScope,
} from '@meridian/domain';
import { sql } from 'drizzle-orm';
import type { DatabaseClient } from './client.js';
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
  DrizzleResourceRepository,
  DrizzleUserRepository,
  type DatabaseTransaction,
} from './repositories.js';

function createTransactionPorts(
  database: DatabaseTransaction,
): TransactionPorts {
  return {
    consentRecords: new DrizzleConsentRecordRepository(database),
    derivationLinks: new DrizzleDerivationLinkRepository(database),
    domainEvents: new DrizzleDomainEventRepository(database),
    entries: new DrizzleEntryRepository(database),
    entryRevisions: new DrizzleEntryRevisionRepository(database),
    integrationAccounts: new DrizzleIntegrationAccountRepository(database),
    outbox: new DrizzleOutboxRepository(database),
    resources: new DrizzleResourceRepository(database),
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
