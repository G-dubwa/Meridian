import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

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
        reject(new Error('Could not allocate an end-to-end test port.'));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitFor(url, processHandle) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null)
      throw new Error('The web server exited before becoming ready.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error('The web server did not become ready within 30 seconds.');
}

const inheritedDatabaseUrl = process.env.TEST_DATABASE_URL;
const postgresBin =
  process.env.POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@18/bin';
const dataDirectory = inheritedDatabaseUrl
  ? null
  : mkdtempSync(join(tmpdir(), 'meridian-auth-e2e-'));
const databasePort = inheritedDatabaseUrl ? null : await availablePort();
const databaseUrl =
  inheritedDatabaseUrl ??
  `postgres://postgres@127.0.0.1:${String(databasePort)}/postgres`;
const webPort = await availablePort();
const baseUrl = `http://127.0.0.1:${String(webPort)}`;
let postgresStarted = false;
let web;

try {
  if (dataDirectory) {
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
      resolve(dataDirectory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${String(databasePort)}`,
      '-w',
      'start',
    ]);
    postgresStarted = true;
  }

  const environment = {
    ...process.env,
    AUTH_E2E_BASE_URL: baseUrl,
    DATABASE_URL: databaseUrl,
  };
  run('pnpm', ['db:migrate'], { env: environment });
  for (const packageName of [
    '@meridian/domain',
    '@meridian/application',
    '@meridian/api-contracts',
    '@meridian/infrastructure-auth',
    '@meridian/infrastructure-db',
  ]) {
    run('pnpm', ['--filter', packageName, 'build'], { env: environment });
  }
  web = spawn(
    'pnpm',
    [
      '--filter',
      '@meridian/web',
      'exec',
      'next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    { env: environment, stdio: 'inherit' },
  );
  await waitFor(`${baseUrl}/health`, web);
  run(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', 'playwright.auth.config.ts'],
    { env: environment },
  );
} finally {
  if (web && web.exitCode === null) {
    web.kill('SIGTERM');
    await Promise.race([
      once(web, 'exit'),
      new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
    ]);
    if (web.exitCode === null) web.kill('SIGKILL');
  }
  if (postgresStarted && dataDirectory) {
    spawnSync(
      resolve(postgresBin, 'pg_ctl'),
      ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'],
      { stdio: 'inherit' },
    );
  }
  if (dataDirectory && dataDirectory.startsWith(tmpdir()))
    rmSync(dataDirectory, { force: true, recursive: true });
}
