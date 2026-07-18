import { AuthenticationService } from '@meridian/application';
import {
  Argon2idPasswordHasher,
  CryptoIdGenerator,
  NodeSecretService,
  SystemClock,
} from '@meridian/infrastructure-auth';
import {
  DrizzleAuthenticationTransactionManager,
  createDatabaseClient,
} from '@meridian/infrastructure-db';

export interface AuthenticationRuntime {
  readonly ids: CryptoIdGenerator;
  readonly secrets: NodeSecretService;
  readonly service: AuthenticationService;
}

function createRuntime(): AuthenticationRuntime {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const database = createDatabaseClient(connectionString);
  const ids = new CryptoIdGenerator();
  const secrets = new NodeSecretService();
  return {
    ids,
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
  };
}

const shared = globalThis as typeof globalThis & {
  meridianAuthenticationRuntime?: AuthenticationRuntime;
};

export function authenticationRuntime(): AuthenticationRuntime {
  shared.meridianAuthenticationRuntime ??= createRuntime();
  return shared.meridianAuthenticationRuntime;
}
