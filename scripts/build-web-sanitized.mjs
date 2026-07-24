import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryWorkspace = mkdtempSync(
  resolve(repositoryRoot, '.worktrees', 'meridian-web-build-'),
);
const temporaryWeb = join(temporaryWorkspace, 'apps', 'web');
const output = resolve(repositoryRoot, 'apps/web/.next');

try {
  mkdirSync(temporaryWeb, { recursive: true });
  for (const entry of [
    'app',
    'next.config.ts',
    'package.json',
    'tsconfig.json',
  ]) {
    cpSync(
      resolve(repositoryRoot, 'apps/web', entry),
      join(temporaryWeb, entry),
      { recursive: true },
    );
  }
  for (const entry of ['node_modules', 'packages', 'tsconfig.base.json']) {
    symlinkSync(
      resolve(repositoryRoot, entry),
      join(temporaryWorkspace, entry),
    );
  }
  symlinkSync(
    resolve(repositoryRoot, 'apps/web/node_modules'),
    join(temporaryWeb, 'node_modules'),
  );

  const result = spawnSync(
    resolve(repositoryRoot, 'apps/web/node_modules/.bin/next'),
    ['build', temporaryWeb],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: '',
        MERIDIAN_KNOWLEDGE_OBJECT_ROOT: '',
        MICROSOFT_CLIENT_ID: '',
        MICROSOFT_CLIENT_SECRET: '',
        MICROSOFT_REDIRECT_URI: '',
        MICROSOFT_TOKEN_ENCRYPTION_KEY: '',
        NEXT_TELEMETRY_DISABLED: '1',
        OPENAI_API_KEY: '',
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0)
    throw new Error(`Next.js build exited with ${String(result.status)}.`);

  rmSync(output, { force: true, recursive: true });
  cpSync(join(temporaryWeb, '.next'), output, { recursive: true });
} finally {
  rmSync(temporaryWorkspace, { force: true, recursive: true });
}
