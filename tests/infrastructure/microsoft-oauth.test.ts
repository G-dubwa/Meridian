import {
  MICROSOFT_STAGE_A_SCOPES,
  microsoftDelegatedScopesV1Schema,
} from '../../packages/domain/src/index.js';
import {
  Aes256GcmTokenCipher,
  MicrosoftOAuthHttpGateway,
  NodePkceGenerator,
  createMicrosoftInfrastructure,
} from '../../packages/infrastructure-ms-graph/src/index.js';
import { microsoftConnectionStatusResponseV1Schema } from '../../packages/api-contracts/src/microsoft-integration.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const configuration = {
  clientId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
  clientSecret: 'local-test-client-secret-only',
  redirectUri: 'http://localhost:3000/api/integrations/microsoft/callback',
};

describe('WP-07 Microsoft OAuth infrastructure', () => {
  it('requires the exact approved Stage-A scope set', () => {
    expect(
      microsoftDelegatedScopesV1Schema.parse([...MICROSOFT_STAGE_A_SCOPES]),
    ).toEqual(MICROSOFT_STAGE_A_SCOPES);
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
        ...MICROSOFT_STAGE_A_SCOPES,
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

  it('builds a consumers-only authorization request without a client secret or forbidden scope', () => {
    const gateway = new MicrosoftOAuthHttpGateway(configuration);
    const url = gateway.authorizationUrl({
      codeChallenge: 'A'.repeat(43),
      redirectUri: configuration.redirectUri,
      scopes: MICROSOFT_STAGE_A_SCOPES,
      state: 'state-value-that-is-long-enough-for-testing',
    });
    expect(url.origin).toBe('https://login.microsoftonline.com');
    expect(url.pathname).toContain('/consumers/');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      MICROSOFT_STAGE_A_SCOPES,
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.search).not.toMatch(/ReadWrite|Mail|Tasks|Shared|\.default/i);
  });

  it('exchanges a code and reads only identity basics through mocked Microsoft HTTP', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requests.push({
        url,
        ...(init === undefined ? {} : { init }),
      });
      if (url.includes('/token'))
        return Promise.resolve(
          Response.json({
            access_token: 'access-token',
            expires_in: 3600,
            id_token: 'unused-id-token',
            refresh_token: 'refresh-token',
            scope: 'User.Read Calendars.Read openid profile',
            token_type: 'Bearer',
          }),
        );
      return Promise.resolve(
        Response.json({
          '@odata.context': 'metadata-not-retained',
          displayName: 'Test Owner',
          id: 'opaque-subject',
          mail: 'not-requested-for-storage@example.test',
        }),
      );
    };
    const gateway = new MicrosoftOAuthHttpGateway(configuration, fetcher);
    const grant = await gateway.exchangeAuthorizationCode(
      'authorization-code',
      'V'.repeat(64),
      configuration.redirectUri,
    );
    expect(grant).toEqual({
      accessToken: 'access-token',
      expiresInSeconds: 3600,
      grantedScopes: MICROSOFT_STAGE_A_SCOPES,
      refreshToken: 'refresh-token',
    });
    await expect(gateway.readProfile(grant.accessToken)).resolves.toEqual({
      displayName: 'Test Owner',
      providerSubjectId: 'opaque-subject',
    });
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
    expect(requests[1]?.url).toContain('?$select=id,displayName');
    expect(requests[1]?.url).not.toMatch(/calendar|mail|task/i);
  });

  it('rejects an over-broad token response and classifies revoked refresh consent', async () => {
    const overBroad: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
          scope: 'User.Read Calendars.Read Mail.Read',
        }),
      );
    await expect(
      new MicrosoftOAuthHttpGateway(
        configuration,
        overBroad,
      ).exchangeAuthorizationCode(
        'authorization-code',
        'V'.repeat(64),
        configuration.redirectUri,
      ),
    ).rejects.toMatchObject({
      reason: 'authorization_failed',
    });

    const revoked: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          { error: 'invalid_grant', error_description: 'must not escape' },
          { status: 400 },
        ),
      );
    await expect(
      new MicrosoftOAuthHttpGateway(configuration, revoked).refresh(
        'refresh-token',
      ),
    ).rejects.toMatchObject({ reason: 'consent_revoked' });
  });

  it('retains the exact requested tuple when Microsoft omits its optional token scope field', async () => {
    const withoutScope: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
        }),
      );
    await expect(
      new MicrosoftOAuthHttpGateway(
        configuration,
        withoutScope,
      ).exchangeAuthorizationCode(
        'authorization-code',
        'V'.repeat(64),
        configuration.redirectUri,
      ),
    ).resolves.toMatchObject({ grantedScopes: MICROSOFT_STAGE_A_SCOPES });
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
        requestedScopes: MICROSOFT_STAGE_A_SCOPES,
      }),
    ).toThrow();
  });

  it('documents every Microsoft variable while keeping real environment files untracked', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const name of [
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'MICROSOFT_REDIRECT_URI',
      'MICROSOFT_TOKEN_ENCRYPTION_KEY',
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
    }
    expect(example).toContain(
      'MICROSOFT_REDIRECT_URI=http://localhost:3000/api/integrations/microsoft/callback',
    );

    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});
