import { createSign, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
  MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  microsoftDelegatedScopesV1Schema,
} from '../../packages/domain/src/index.js';
import {
  Aes256GcmTokenCipher,
  MicrosoftIdTokenVerifier,
  MicrosoftOAuthHttpGateway,
  NodePkceGenerator,
  createMicrosoftInfrastructure,
} from '../../packages/infrastructure-ms-graph/src/index.js';
import {
  microsoftConnectionStatusResponseV1Schema,
  microsoftTodoConsentRequestV1Schema,
} from '../../packages/api-contracts/src/microsoft-integration.js';
import { describe, expect, it } from 'vitest';

const configuration = {
  clientId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
  clientSecret: 'local-test-client-secret-only',
  redirectUri: 'http://localhost:3000/api/integrations/microsoft/callback',
};
const nonce = 'N'.repeat(43);
const identity = {
  displayName: 'Test Owner',
  nonce,
  providerSubjectId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01977',
};
const idTokens = {
  validate: () => Promise.resolve(identity),
};

function tokenResponse(
  accessToken: string,
  scope: string | undefined,
): Readonly<Record<string, unknown>> {
  return {
    access_token: accessToken,
    expires_in: 3600,
    id_token: 'signed-id-token-is-validated-separately',
    refresh_token: 'refresh-token',
    ...(scope === undefined ? {} : { scope }),
    token_type: 'Bearer',
  };
}

function signedIdToken(overrides: Readonly<Record<string, unknown>> = {}): {
  readonly publicKey: KeyObject;
  readonly token: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'local-test-key', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      aud: configuration.clientId,
      exp: now + 300,
      iat: now,
      iss: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
      name: identity.displayName,
      nonce,
      oid: identity.providerSubjectId,
      sub: 'synthetic-subject',
      tid: '9188040d-6c67-4c5b-b112-36a304b66dad',
      ...overrides,
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey, 'base64url');
  return { publicKey, token: `${signingInput}.${signature}` };
}

describe('Microsoft OAuth infrastructure', () => {
  it('requires the exact approved Stage-A scope set', () => {
    expect(
      microsoftDelegatedScopesV1Schema.parse([
        ...MICROSOFT_STAGE_A_REQUESTED_SCOPES,
      ]),
    ).toEqual(MICROSOFT_STAGE_A_REQUESTED_SCOPES);
    expect(() =>
      microsoftDelegatedScopesV1Schema.parse([
        'openid',
        'profile',
        'offline_access',
        'User.Read',
        'Calendars.ReadWrite',
      ]),
    ).toThrow();
    expect(() =>
      microsoftDelegatedScopesV1Schema.parse([
        ...MICROSOFT_STAGE_A_REQUESTED_SCOPES,
        'User.Read',
      ]),
    ).toThrow();
  });

  it('creates S256 PKCE and context-bound AES-256-GCM envelopes', () => {
    const pkce = new NodePkceGenerator().generate();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const cipher = new Aes256GcmTokenCipher(
      Buffer.alloc(32, 3).toString('base64'),
    );
    const encrypted = cipher.seal('provider-token', 'owner-a:access');
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('provider-token');
    expect(cipher.open(encrypted, 'owner-a:access')).toBe('provider-token');
    expect(() => cipher.open(encrypted, 'owner-b:access')).toThrow();
    expect(
      () => new Aes256GcmTokenCipher(Buffer.alloc(16).toString('base64')),
    ).toThrow(/32 bytes/);
  });

  it('builds a consumers-only form-post authorization request with PKCE and nonce', () => {
    const gateway = new MicrosoftOAuthHttpGateway(
      configuration,
      fetch,
      idTokens,
    );
    const url = gateway.authorizationUrl({
      codeChallenge: 'A'.repeat(43),
      nonce,
      redirectUri: configuration.redirectUri,
      scopes: MICROSOFT_STAGE_A_REQUESTED_SCOPES,
      state: 'state-value-that-is-long-enough-for-testing',
    });
    expect(url.origin).toBe('https://login.microsoftonline.com');
    expect(url.pathname).toContain('/consumers/');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      MICROSOFT_STAGE_A_REQUESTED_SCOPES,
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('nonce')).toBe(nonce);
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.search).not.toMatch(/ReadWrite|Mail|Tasks|Shared|\.default/i);
  });

  it.each([
    'opaque-access-token-with-no-claims',
    'EwB4A8l6BAAU7pZ2Z3n_encrypted-looking-not-a-jwt',
  ])(
    'accepts an opaque Graph credential using exact token-response permissions: %s',
    async (accessToken) => {
      const requests: { url: string; init?: RequestInit }[] = [];
      const fetcher: typeof fetch = (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requests.push({ url, ...(init === undefined ? {} : { init }) });
        return Promise.resolve(
          Response.json(
            tokenResponse(
              accessToken,
              'openid profile offline_access User.Read Calendars.Read',
            ),
          ),
        );
      };
      const gateway = new MicrosoftOAuthHttpGateway(
        configuration,
        fetcher,
        idTokens,
      );
      await expect(
        gateway.exchangeAuthorizationCode(
          'authorization-code',
          'V'.repeat(64),
          configuration.redirectUri,
          MICROSOFT_STAGE_A_REQUESTED_SCOPES,
        ),
      ).resolves.toEqual({
        accessToken,
        expiresInSeconds: 3600,
        graphPermissions: MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
        identity,
        refreshToken: 'refresh-token',
      });
      expect(requests).toHaveLength(1);
      const tokenBody = requests[0]?.init?.body;
      const tokenForm =
        tokenBody instanceof URLSearchParams
          ? tokenBody.toString()
          : typeof tokenBody === 'string'
            ? tokenBody
            : '';
      expect(tokenForm).toContain('code_verifier=');
      expect(tokenForm).toContain('client_secret=');
      expect(tokenForm).not.toMatch(/ReadWrite|Mail|Tasks|Shared|\.default/i);
    },
  );

  it('normalizes qualified Graph permission metadata and ignores only requested OIDC markers', async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          tokenResponse(
            'opaque-access-token',
            [
              'profile',
              'https://graph.microsoft.com/Tasks.ReadWrite',
              'openid',
              'https://graph.microsoft.com/Calendars.Read',
              'offline_access',
              'https://graph.microsoft.com/User.Read',
            ].join(' '),
          ),
        ),
      );
    await expect(
      new MicrosoftOAuthHttpGateway(
        configuration,
        fetcher,
        idTokens,
      ).exchangeAuthorizationCode(
        'authorization-code',
        'V'.repeat(64),
        configuration.redirectUri,
        MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
      ),
    ).resolves.toMatchObject({
      accessToken: 'opaque-access-token',
      graphPermissions: MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
    });
  });

  it.each([
    { label: 'absent', scope: undefined },
    { label: 'empty', scope: '   ' },
    { label: 'missing', scope: 'User.Read Calendars.Read' },
    {
      label: 'duplicate',
      scope: 'User.Read Calendars.Read Tasks.ReadWrite User.Read',
    },
    {
      label: 'unexpected Graph permission',
      scope: 'User.Read Calendars.Read Tasks.ReadWrite Tasks.Read',
    },
    {
      label: 'unexpected OIDC marker',
      scope: 'openid email User.Read Calendars.Read Tasks.ReadWrite',
    },
    {
      label: 'malformed qualified permission',
      scope:
        'User.Read Calendars.Read Tasks.ReadWrite https://graph.microsoft.com/',
    },
  ])(
    'fails closed for $label token-response scope metadata',
    async ({ scope }) => {
      const fetcher: typeof fetch = () =>
        Promise.resolve(
          Response.json(tokenResponse('opaque-access-token', scope)),
        );
      await expect(
        new MicrosoftOAuthHttpGateway(
          configuration,
          fetcher,
          idTokens,
        ).exchangeAuthorizationCode(
          'authorization-code',
          'V'.repeat(64),
          configuration.redirectUri,
          MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
        ),
      ).rejects.toMatchObject({
        reason: 'authorization_failed',
        stage: 'scope_validation',
      });
    },
  );

  it('cryptographically validates the Microsoft consumer ID token', async () => {
    const signed = signedIdToken();
    const verifier = new MicrosoftIdTokenVerifier(
      configuration.clientId,
      () => signed.publicKey,
    );
    await expect(verifier.validate(signed.token)).resolves.toEqual(identity);

    const wrongIssuer = signedIdToken({
      iss: 'https://login.microsoftonline.com/unexpected/v2.0',
    });
    await expect(
      new MicrosoftIdTokenVerifier(
        configuration.clientId,
        () => wrongIssuer.publicKey,
      ).validate(wrongIssuer.token),
    ).rejects.toMatchObject({
      reason: 'authorization_failed',
      stage: 'identity_validation',
    });

    const wrongKey = signedIdToken();
    await expect(
      new MicrosoftIdTokenVerifier(
        configuration.clientId,
        () => wrongKey.publicKey,
      ).validate(signed.token),
    ).rejects.toMatchObject({
      reason: 'authorization_failed',
      stage: 'identity_validation',
    });
  });

  it('classifies revoked refresh consent without retaining provider detail', async () => {
    const revoked: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          { error: 'invalid_grant', error_description: 'must not escape' },
          { status: 400 },
        ),
      );
    await expect(
      new MicrosoftOAuthHttpGateway(configuration, revoked, idTokens).refresh(
        'refresh-token',
        MICROSOFT_STAGE_A_REQUESTED_SCOPES,
      ),
    ).rejects.toMatchObject({
      reason: 'consent_revoked',
      stage: 'token_exchange',
    });
  });

  it('remains disabled until every local variable is present and never exposes tokens through the API contract', () => {
    expect(
      createMicrosoftInfrastructure({
        clientId: configuration.clientId,
        clientSecret: undefined,
        redirectUri: configuration.redirectUri,
        tokenEncryptionKey: undefined,
      }),
    ).toBeUndefined();
    expect(() =>
      microsoftConnectionStatusResponseV1Schema.parse({
        account: null,
        accessToken: 'must-not-appear',
        configured: false,
        consentRecords: [],
        requestedScopes: MICROSOFT_STAGE_A_REQUESTED_SCOPES,
      }),
    ).toThrow();
    expect(
      microsoftConnectionStatusResponseV1Schema.parse({
        account: null,
        configured: false,
        consentRecords: [],
        requestedScopes: MICROSOFT_STAGE_A_REQUESTED_SCOPES,
        todoConsent: {
          eligible: false,
          expectedGraphPermissions: MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
          requestedScopes: MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
        },
      }).todoConsent,
    ).toEqual({
      eligible: false,
      expectedGraphPermissions: MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
      requestedScopes: MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
    });
    expect(
      microsoftTodoConsentRequestV1Schema.parse({
        confirmation: 'ENABLE WP11 TODO CONSENT',
      }),
    ).toEqual({ confirmation: 'ENABLE WP11 TODO CONSENT' });
    expect(() =>
      microsoftTodoConsentRequestV1Schema.parse({ confirmation: 'CONNECT' }),
    ).toThrow();
  });

  it('documents every Microsoft variable while keeping real environment files untracked', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const name of [
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'MICROSOFT_REDIRECT_URI',
      'MICROSOFT_TOKEN_ENCRYPTION_KEY',
    ])
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
    expect(example).toContain(
      'MICROSOFT_REDIRECT_URI=http://localhost:3000/api/integrations/microsoft/callback',
    );

    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});
