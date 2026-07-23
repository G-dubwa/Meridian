import { chmodSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const secretPatterns = [
  {
    code: 'private_key',
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  {
    code: 'provider_key',
    expression: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b/u,
  },
  {
    code: 'credential_assignment',
    expression:
      /\b(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PASSWORD|COOKIE|PKCE_VERIFIER)\s*[:=]\s*["']?[^\s"',]{8,}/iu,
  },
  {
    code: 'connection_string',
    expression: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/iu,
  },
  {
    code: 'oauth_callback_query',
    expression: /\/callback\?[^\s]*(?:code|state)=/iu,
  },
] as const;

export function scanSensitiveText(
  text: string,
): readonly { readonly code: string; readonly index: number }[] {
  return secretPatterns.flatMap((pattern) => {
    const match = pattern.expression.exec(text);
    return match ? [{ code: pattern.code, index: match.index }] : [];
  });
}

export function assertNoSensitiveText(text: string, label: string): void {
  const findings = scanSensitiveText(text);
  if (findings.length > 0)
    throw new Error(
      `${label} failed secret scanning (${findings.map((item) => item.code).join(', ')}).`,
    );
}

export function assertSafeRelativePath(
  repositoryRoot: string,
  rawPath: string,
): string {
  if (rawPath.includes('\0')) throw new Error('Path contains a null byte.');
  const absolute = resolve(repositoryRoot, rawPath);
  const fromRoot = relative(repositoryRoot, absolute);
  if (
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    fromRoot.startsWith(sep)
  )
    throw new Error('Path escapes the repository root.');
  const normalized = fromRoot.split(sep).join('/');
  if (
    normalized === '.env' ||
    normalized.endsWith('/.env') ||
    normalized === '.env.local' ||
    normalized.endsWith('/.env.local') ||
    /(^|\/)\.env\.[^/]+$/u.test(normalized)
  )
    throw new Error('Environment files are forbidden.');
  return normalized;
}

export function assertPathsAllowed(
  repositoryRoot: string,
  paths: readonly string[],
  allowedPrefixes: readonly string[],
): void {
  const rejected = paths.filter((path) => {
    const safe = assertSafeRelativePath(repositoryRoot, path);
    return !allowedPrefixes.some(
      (prefix) => safe === prefix || safe.startsWith(prefix),
    );
  });
  if (rejected.length > 0)
    throw new Error(
      `Changes exceed the approved scope: ${rejected.join(', ')}`,
    );
}

export function secureDirectory(path: string): void {
  mkdirSync(path, { mode: 0o700, recursive: true });
  chmodSync(path, 0o700);
}

export function assertPrivateArtifact(path: string): void {
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0)
    throw new Error(`Artifact permissions are too broad: ${path}`);
  assertNoSensitiveText(readFileSync(path, 'utf8'), path);
}

export function safeChildEnvironment(
  additions: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  const allowed = [
    'HOME',
    'PATH',
    'USER',
    'SHELL',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TERM',
    'CODEX_HOME',
    'CLAUDE_CONFIG_DIR',
  ] as const;
  const environment = {} as NodeJS.ProcessEnv;
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return {
    ...environment,
    CI: 'true',
    MERIDIAN_EXTERNAL_PROVIDER_NETWORK: 'deny',
    NEXT_TELEMETRY_DISABLED: '1',
    ...additions,
  };
}
