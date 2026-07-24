import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
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
const knowledgeObjectRoot = mkdtempSync(
  join(tmpdir(), 'meridian-auth-e2e-knowledge-'),
);
const sanitizedWorkspace = mkdtempSync(
  resolve('.worktrees', 'meridian-auth-e2e-workspace-'),
);
const sanitizedWeb = join(sanitizedWorkspace, 'apps', 'web');
mkdirSync(sanitizedWeb, { recursive: true });
for (const entry of [
  'app',
  'next.config.ts',
  'package.json',
  'tsconfig.json',
]) {
  cpSync(resolve('apps/web', entry), join(sanitizedWeb, entry), {
    recursive: true,
  });
}
for (const entry of ['node_modules', 'packages', 'tsconfig.base.json']) {
  symlinkSync(resolve(entry), join(sanitizedWorkspace, entry));
}
symlinkSync(
  resolve('apps/web/node_modules'),
  join(sanitizedWeb, 'node_modules'),
);
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
    MERIDIAN_KNOWLEDGE_OBJECT_ROOT: knowledgeObjectRoot,
    MICROSOFT_CLIENT_ID: '',
    MICROSOFT_CLIENT_SECRET: '',
    MICROSOFT_REDIRECT_URI: '',
    MICROSOFT_TOKEN_ENCRYPTION_KEY: '',
    NEXT_TELEMETRY_DISABLED: '1',
    OPENAI_API_KEY: '',
  };
  run(
    resolve('node_modules/.bin/tsx'),
    ['packages/infrastructure-db/src/migrate.ts'],
    { env: environment },
  );
  run(
    resolve('node_modules/.bin/tsc'),
    [
      '--build',
      'packages/domain',
      'packages/scheduling',
      'packages/retrieval',
      'packages/application',
      'packages/api-contracts',
      'packages/infrastructure-auth',
      'packages/infrastructure-db',
      'packages/infrastructure-ms-graph',
      'packages/knowledge',
    ],
    { env: environment },
  );
  web = spawn(
    resolve('apps/web/node_modules/.bin/next'),
    ['dev', sanitizedWeb, '--hostname', '127.0.0.1', '--port', String(webPort)],
    { env: environment, stdio: 'inherit' },
  );
  await waitFor(`${baseUrl}/health`, web);
  run(
    resolve('node_modules/.bin/playwright'),
    ['test', '--config', 'playwright.auth.config.ts'],
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
  if (knowledgeObjectRoot.startsWith(tmpdir()))
    rmSync(knowledgeObjectRoot, { force: true, recursive: true });
  if (sanitizedWorkspace.startsWith(resolve('.worktrees')))
    rmSync(sanitizedWorkspace, { force: true, recursive: true });
}
