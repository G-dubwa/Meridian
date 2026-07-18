import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0)
    throw new Error(`${command} exited with ${String(result.status)}`);
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a PostgreSQL test port.'));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

const inheritedUrl = process.env.TEST_DATABASE_URL;
if (inheritedUrl) {
  run('pnpm', [
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.integration.config.ts',
  ]);
  process.exit(0);
}

const postgresBin =
  process.env.POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@18/bin';
const dataDirectory = mkdtempSync(join(tmpdir(), 'meridian-pg-integration-'));
const logPath = resolve(dataDirectory, 'postgres.log');
const port = await availablePort();
let started = false;

try {
  run(resolve(postgresBin, 'initdb'), [
    '--auth=trust',
    '--encoding=UTF8',
    '--no-locale',
    '--username=postgres',
    '-D',
    dataDirectory,
  ]);
  run(resolve(postgresBin, 'pg_ctl'), [
    '-D',
    dataDirectory,
    '-l',
    logPath,
    '-o',
    `-h 127.0.0.1 -p ${String(port)}`,
    '-w',
    'start',
  ]);
  started = true;
  run(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts'],
    {
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgres://postgres@127.0.0.1:${String(port)}/postgres`,
      },
    },
  );
} finally {
  if (started) {
    spawnSync(
      resolve(postgresBin, 'pg_ctl'),
      ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'],
      {
        stdio: 'inherit',
      },
    );
  }
  if (dataDirectory.startsWith(tmpdir()))
    rmSync(dataDirectory, { force: true, recursive: true });
}
