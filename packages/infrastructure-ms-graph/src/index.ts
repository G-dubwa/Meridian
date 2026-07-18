import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  MICROSOFT_STAGE_A_SCOPES,
  MicrosoftOAuthGatewayError,
  microsoftDelegatedScopesV1Schema,
  microsoftProfileV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  MicrosoftAuthorizationRequest,
  MicrosoftDelegatedScope,
  MicrosoftOAuthGateway,
  MicrosoftProfile,
  MicrosoftTokenGrant,
  PkceGenerator,
  PkcePair,
  TokenCipher,
} from '@meridian/domain';

const AUTHORIZE_ENDPOINT =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_ENDPOINT =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const PROFILE_ENDPOINT =
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName';
const CALLBACK_PATH = '/api/integrations/microsoft/callback';
const TOKEN_TIMEOUT_MS = 10_000;

export interface MicrosoftOAuthConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface MicrosoftEnvironment {
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly redirectUri: string | undefined;
  readonly tokenEncryptionKey: string | undefined;
}

export interface ConfiguredMicrosoftInfrastructure {
  readonly cipher: TokenCipher;
  readonly gateway: MicrosoftOAuthGateway;
  readonly pkce: PkceGenerator;
  readonly redirectUri: string;
}

function configuredValue(value: string | undefined): string | undefined {
  return value?.trim();
}

function validateRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      'MICROSOFT_REDIRECT_URI must not contain credentials or a query.',
    );
  if (url.pathname !== CALLBACK_PATH)
    throw new Error(`MICROSOFT_REDIRECT_URI must end with ${CALLBACK_PATH}.`);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error(
      'MICROSOFT_REDIRECT_URI must use HTTPS except on loopback.',
    );
  return url.toString();
}

export function createMicrosoftInfrastructure(
  environment: MicrosoftEnvironment,
  fetcher: typeof fetch = fetch,
): ConfiguredMicrosoftInfrastructure | undefined {
  const clientId = configuredValue(environment.clientId);
  const clientSecret = configuredValue(environment.clientSecret);
  const redirectUri = configuredValue(environment.redirectUri);
  const tokenEncryptionKey = configuredValue(environment.tokenEncryptionKey);
  if (!clientId || !clientSecret || !redirectUri || !tokenEncryptionKey)
    return undefined;
  uuidV1Schema.parse(clientId);
  if (clientSecret.length < 16)
    throw new Error('MICROSOFT_CLIENT_SECRET is unexpectedly short.');
  const validatedRedirectUri = validateRedirectUri(redirectUri);
  return {
    cipher: new Aes256GcmTokenCipher(tokenEncryptionKey),
    gateway: new MicrosoftOAuthHttpGateway(
      { clientId, clientSecret, redirectUri: validatedRedirectUri },
      fetcher,
    ),
    pkce: new NodePkceGenerator(),
    redirectUri: validatedRedirectUri,
  };
}

export class NodePkceGenerator implements PkceGenerator {
  public generate(): PkcePair {
    const verifier = randomBytes(64).toString('base64url');
    return {
      challenge: createHash('sha256')
        .update(verifier, 'ascii')
        .digest('base64url'),
      verifier,
    };
  }
}

export class Aes256GcmTokenCipher implements TokenCipher {
  private readonly key: Buffer;

  public constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32)
      throw new Error(
        'MICROSOFT_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
  }

  public seal(plainText: string, context: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  public open(envelope: string, context: string): string {
    const [version, nonceValue, ciphertextValue, tagValue, extra] =
      envelope.split('.');
    if (
      version !== 'v1' ||
      !nonceValue ||
      !ciphertextValue ||
      !tagValue ||
      extra
    )
      throw new Error('Encrypted token envelope is invalid.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(nonceValue, 'base64url'),
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

interface TokenEndpointResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope?: string;
}

function canonicalScope(value: string): MicrosoftDelegatedScope | null {
  const withoutResource = value.replace(
    /^https:\/\/graph\.microsoft\.com\//i,
    '',
  );
  return (
    MICROSOFT_STAGE_A_SCOPES.find(
      (scope) => scope.toLowerCase() === withoutResource.toLowerCase(),
    ) ?? null
  );
}

function validateReturnedScopes(
  value: string,
): readonly MicrosoftDelegatedScope[] {
  const returned = value.split(/\s+/).filter(Boolean);
  const canonical = returned.map(canonicalScope);
  if (canonical.some((scope) => scope === null))
    throw new MicrosoftOAuthGatewayError('authorization_failed');
  const unique = new Set(canonical);
  if (!unique.has('User.Read') || !unique.has('Calendars.Read'))
    throw new MicrosoftOAuthGatewayError('authorization_failed');
  return microsoftDelegatedScopesV1Schema.parse([...MICROSOFT_STAGE_A_SCOPES]);
}

function tokenResponse(value: unknown): TokenEndpointResponse {
  if (!value || typeof value !== 'object')
    throw new MicrosoftOAuthGatewayError('provider_unavailable');
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.access_token !== 'string' ||
    (candidate.refresh_token !== undefined &&
      typeof candidate.refresh_token !== 'string') ||
    typeof candidate.expires_in !== 'number' ||
    !Number.isFinite(candidate.expires_in) ||
    candidate.expires_in <= 0 ||
    (candidate.scope !== undefined && typeof candidate.scope !== 'string')
  )
    throw new MicrosoftOAuthGatewayError('provider_unavailable');
  return {
    access_token: candidate.access_token,
    ...(candidate.refresh_token === undefined
      ? {}
      : { refresh_token: candidate.refresh_token }),
    expires_in: candidate.expires_in,
    ...(candidate.scope === undefined ? {} : { scope: candidate.scope }),
  };
}

export class MicrosoftOAuthHttpGateway implements MicrosoftOAuthGateway {
  public constructor(
    private readonly configuration: MicrosoftOAuthConfiguration,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public authorizationUrl(request: MicrosoftAuthorizationRequest): URL {
    if (request.redirectUri !== this.configuration.redirectUri)
      throw new MicrosoftOAuthGatewayError('authorization_failed');
    const scopes = microsoftDelegatedScopesV1Schema.parse([...request.scopes]);
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: this.configuration.clientId,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: request.redirectUri,
      response_mode: 'query',
      response_type: 'code',
      scope: scopes.join(' '),
      state: request.state,
    }).toString();
    return url;
  }

  public exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<MicrosoftTokenGrant> {
    if (redirectUri !== this.configuration.redirectUri)
      throw new MicrosoftOAuthGatewayError('authorization_failed');
    return this.requestToken(
      new URLSearchParams({
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: MICROSOFT_STAGE_A_SCOPES.join(' '),
      }),
    );
  }

  public refresh(refreshToken: string): Promise<MicrosoftTokenGrant> {
    return this.requestToken(
      new URLSearchParams({
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: MICROSOFT_STAGE_A_SCOPES.join(' '),
      }),
      refreshToken,
    );
  }

  public async readProfile(accessToken: string): Promise<MicrosoftProfile> {
    let response: Response;
    try {
      response = await this.fetcher(PROFILE_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftOAuthGatewayError('provider_unavailable');
    }
    if (!response.ok)
      throw new MicrosoftOAuthGatewayError(
        response.status === 401 || response.status === 403
          ? 'consent_revoked'
          : 'provider_unavailable',
      );
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new MicrosoftOAuthGatewayError('provider_unavailable');
    }
    if (!value || typeof value !== 'object')
      throw new MicrosoftOAuthGatewayError('provider_unavailable');
    const candidate = value as Readonly<Record<string, unknown>>;
    return microsoftProfileV1Schema.parse({
      displayName: candidate.displayName,
      providerSubjectId: candidate.id,
    });
  }

  private async requestToken(
    form: URLSearchParams,
    priorRefreshToken?: string,
  ): Promise<MicrosoftTokenGrant> {
    let response: Response;
    try {
      response = await this.fetcher(TOKEN_ENDPOINT, {
        body: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftOAuthGatewayError('provider_unavailable');
    }
    if (!response.ok) {
      let errorCode: unknown;
      try {
        const error = (await response.json()) as Readonly<
          Record<string, unknown>
        >;
        errorCode = error.error;
      } catch {
        errorCode = undefined;
      }
      throw new MicrosoftOAuthGatewayError(
        errorCode === 'invalid_grant'
          ? 'consent_revoked'
          : response.status >= 500
            ? 'provider_unavailable'
            : 'authorization_failed',
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new MicrosoftOAuthGatewayError('provider_unavailable');
    }
    const token = tokenResponse(raw);
    const refreshToken = token.refresh_token ?? priorRefreshToken;
    if (!refreshToken)
      throw new MicrosoftOAuthGatewayError('authorization_failed');
    return {
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
      grantedScopes:
        token.scope === undefined
          ? microsoftDelegatedScopesV1Schema.parse([
              ...MICROSOFT_STAGE_A_SCOPES,
            ])
          : validateReturnedScopes(token.scope),
      refreshToken,
    };
  }
}
