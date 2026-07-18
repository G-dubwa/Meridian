import type {
  AuthenticationTransactionManager,
  AuthenticationTransactionPorts,
} from '@meridian/domain';
import type { DatabaseClient } from './client.js';
import {
  DrizzleAuthCredentialRepository,
  DrizzleAuthEventRepository,
  DrizzleAuthRateLimitRepository,
  DrizzleAuthSessionRepository,
  DrizzleOwnerBootstrapRepository,
  DrizzleRecoveryCodeRepository,
} from './authentication-repositories.js';
import type { DatabaseTransaction } from './repositories.js';

function createAuthenticationPorts(
  database: DatabaseTransaction,
): AuthenticationTransactionPorts {
  return {
    bootstrap: new DrizzleOwnerBootstrapRepository(database),
    credentials: new DrizzleAuthCredentialRepository(database),
    events: new DrizzleAuthEventRepository(database),
    rateLimits: new DrizzleAuthRateLimitRepository(database),
    recoveryCodes: new DrizzleRecoveryCodeRepository(database),
    sessions: new DrizzleAuthSessionRepository(database),
  };
}

export class DrizzleAuthenticationTransactionManager implements AuthenticationTransactionManager {
  public constructor(private readonly database: DatabaseClient) {}

  public run<T>(
    operation: (ports: AuthenticationTransactionPorts) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      operation(createAuthenticationPorts(transaction)),
    );
  }
}
