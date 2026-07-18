import {
  AuthenticationService,
  JournalService,
  MicrosoftConnectionService,
  NoopMaterialChangeInvalidationHook,
  OutboxHealthService,
} from '@meridian/application';
import {
  Argon2idPasswordHasher,
  CryptoIdGenerator,
  NodeSecretService,
  SystemClock,
} from '@meridian/infrastructure-auth';
import {
  DrizzleAuthenticationTransactionManager,
  DrizzleOAuthAuthorizationSessionStore,
  DrizzleTransactionManager,
  createDatabaseClient,
} from '@meridian/infrastructure-db';
import { createMicrosoftInfrastructure } from '@meridian/infrastructure-ms-graph';

export interface AuthenticationRuntime {
  readonly ids: CryptoIdGenerator;
  readonly journal: JournalService;
  readonly microsoft: MicrosoftConnectionService;
  readonly secrets: NodeSecretService;
  readonly service: AuthenticationService;
  readonly workerHealth: OutboxHealthService;
}

function createRuntime(): AuthenticationRuntime {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const database = createDatabaseClient(connectionString);
  const ids = new CryptoIdGenerator();
  const secrets = new NodeSecretService();
  const transactions = new DrizzleTransactionManager(database.database);
  const microsoftInfrastructure = createMicrosoftInfrastructure({
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
    tokenEncryptionKey: process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY,
  });
  return {
    ids,
    journal: new JournalService({
      clock: new SystemClock(),
      contentHasher: secrets,
      ids,
      invalidation: new NoopMaterialChangeInvalidationHook(),
      transactions,
    }),
    microsoft: new MicrosoftConnectionService({
      ...(microsoftInfrastructure === undefined
        ? {}
        : { authorization: microsoftInfrastructure }),
      clock: new SystemClock(),
      ids,
      oauthSessions: new DrizzleOAuthAuthorizationSessionStore(
        database.database,
      ),
      secrets,
      transactions,
    }),
    secrets,
    service: new AuthenticationService({
      clock: new SystemClock(),
      ids,
      passwords: new Argon2idPasswordHasher(),
      secrets,
      transactions: new DrizzleAuthenticationTransactionManager(
        database.database,
      ),
    }),
    workerHealth: new OutboxHealthService(transactions),
  };
}

const shared = globalThis as typeof globalThis & {
  meridianAuthenticationRuntime?: AuthenticationRuntime;
};

export function authenticationRuntime(): AuthenticationRuntime {
  shared.meridianAuthenticationRuntime ??= createRuntime();
  return shared.meridianAuthenticationRuntime;
}
