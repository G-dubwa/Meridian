import { stdin, stdout } from 'node:process';
import { AuthenticationService } from '../packages/application/src/authentication.js';
import {
  Argon2idPasswordHasher,
  CryptoIdGenerator,
  NodeSecretService,
  SystemClock,
} from '../packages/infrastructure-auth/src/index.js';
import { createDatabaseClient } from '../packages/infrastructure-db/src/client.js';
import { DrizzleAuthenticationTransactionManager } from '../packages/infrastructure-db/src/authentication-transaction-manager.js';

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value.`);
  return value;
}

async function readPasswordFromStdin(): Promise<string> {
  stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of stdin as AsyncIterable<string>) input += chunk;
  const [password, confirmation] = input.split(/\r?\n/);
  if (!password || password !== confirmation)
    throw new Error('Passphrase and confirmation must match.');
  return password;
}

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY)
    throw new Error(
      'Use --password-stdin when no interactive TTY is available.',
    );
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Bootstrap cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassphrase(): Promise<string> {
  if (process.argv.includes('--password-stdin')) return readPasswordFromStdin();
  const password = await readHidden('Owner passphrase: ');
  const confirmation = await readHidden('Confirm passphrase: ');
  if (password !== confirmation)
    throw new Error('Passphrase and confirmation must match.');
  return password;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const identifier = argument('--identifier', 'owner');
  const homeTimeZone = argument('--time-zone', 'Africa/Johannesburg');
  const locale = argument('--locale', 'en-ZA');
  new Intl.DateTimeFormat(locale, { timeZone: homeTimeZone }).format(
    new Date(),
  );
  const passphrase = await readPassphrase();
  const client = createDatabaseClient(connectionString);
  const secrets = new NodeSecretService();
  const ids = new CryptoIdGenerator();
  const service = new AuthenticationService({
    clock: new SystemClock(),
    ids,
    passwords: new Argon2idPasswordHasher(),
    secrets,
    transactions: new DrizzleAuthenticationTransactionManager(client.database),
  });
  try {
    const result = await service.bootstrapOwner(
      { homeTimeZone, identifier, locale, passphrase },
      {
        clientFingerprintHash: secrets.hash('bootstrap-cli'),
        requestId: ids.next(),
      },
    );
    stdout.write(`Owner created: ${result.userId}\n`);
    stdout.write(
      'Store these one-time recovery codes offline. They are never shown again.\n',
    );
    for (const code of result.recoveryCodes) stdout.write(`${code}\n`);
  } finally {
    await client.sql.end();
  }
}

void main().catch((error: unknown) => {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : 'BOOTSTRAP_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
