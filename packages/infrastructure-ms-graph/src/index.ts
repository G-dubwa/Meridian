import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  MicrosoftOAuthGatewayError,
  expectedMicrosoftGraphPermissionsV1,
  microsoftGraphPermissionV1Schema,
  microsoftGraphPermissionsV1Schema,
  microsoftOidcNonceV1Schema,
  microsoftProviderSubjectIdV1Schema,
  microsoftRequestedScopesV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  MicrosoftAuthorizationGrant,
  MicrosoftAuthorizationIdentity,
  MicrosoftAuthorizationRequest,
  MicrosoftGraphPermission,
  MicrosoftIdentityValidationDiagnostic,
  MicrosoftRequestedScope,
  MicrosoftOAuthGateway,
  MicrosoftTokenGrant,
  PkceGenerator,
  PkcePair,
  TokenCipher,
} from '@meridian/domain';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export * from './todo.js';

const AUTHORIZE_ENDPOINT =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_ENDPOINT =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const MICROSOFT_ACCOUNT_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const OIDC_DISCOVERY_ENDPOINT =
  'https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration';
const CALLBACK_PATH = '/api/integrations/microsoft/callback';
const TOKEN_TIMEOUT_MS = 10_000;
const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 5;
const ID_TOKEN_MAX_AGE_SECONDS = 10 * 60;

export interface MicrosoftConsumersOidcConfiguration {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly signingAlgorithms: readonly string[];
}

export interface MicrosoftIdTokenVerifierOptions {
  readonly currentDate?: () => Date;
  readonly keysFor?: (jwksUri: URL) => JWTVerifyGetKey;
  readonly loadConfiguration?: () => Promise<MicrosoftConsumersOidcConfiguration>;
}

function identityDiagnostic(
  substage: MicrosoftIdentityValidationDiagnostic['substage'],
  overrides: Partial<MicrosoftIdentityValidationDiagnostic> = {},
): MicrosoftIdentityValidationDiagnostic {
  return {
    algorithm: 'not_reached',
    audienceMatch: null,
    issuerCategory: 'not_reached',
    matchingKidFound: null,
    nonceMatch: null,
    requiredClaimsPresent: null,
    substage,
    tenantMatch: null,
    timeValid: null,
    tokenVersion: 'not_reached',
    ...overrides,
  };
}

function identityValidationFailure(
  diagnostic: MicrosoftIdentityValidationDiagnostic,
): MicrosoftOAuthGatewayError {
  return new MicrosoftOAuthGatewayError(
    'authorization_failed',
    'identity_validation',
    diagnostic,
  );
}

function safeAlgorithm(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(value)
    ? value
    : 'other';
}

function issuerCategory(
  value: unknown,
): MicrosoftIdentityValidationDiagnostic['issuerCategory'] {
  if (
    value ===
    `https://login.microsoftonline.com/${MICROSOFT_ACCOUNT_TENANT_ID}/v2.0`
  )
    return 'consumer_tenant_guid';
  if (value === 'https://login.microsoftonline.com/consumers/v2.0')
    return 'literal_consumers';
  return typeof value === 'string' ? 'other' : 'not_reached';
}

function exactAudience(value: unknown, clientId: string): boolean {
  return typeof value === 'string' && value === clientId;
}

function timeWindowValid(payload: JWTPayload, currentDate: Date): boolean {
  if (
    typeof payload.exp !== 'number' ||
    typeof payload.nbf !== 'number' ||
    typeof payload.iat !== 'number'
  )
    return false;
  const now = currentDate.getTime() / 1000;
  return (
    payload.exp > now - ID_TOKEN_CLOCK_TOLERANCE_SECONDS &&
    payload.nbf <= now + ID_TOKEN_CLOCK_TOLERANCE_SECONDS &&
    payload.iat <= now + ID_TOKEN_CLOCK_TOLERANCE_SECONDS &&
    now - payload.iat <=
      ID_TOKEN_MAX_AGE_SECONDS + ID_TOKEN_CLOCK_TOLERANCE_SECONDS
  );
}

function requiredIdentityClaimsPresent(payload: JWTPayload): boolean {
  return (
    typeof payload.name === 'string' &&
    payload.name.length >= 1 &&
    payload.name.length <= 255 &&
    microsoftProviderSubjectIdV1Schema.safeParse(payload.oid).success &&
    typeof payload.sub === 'string' &&
    payload.sub.length >= 1 &&
    payload.sub.length <= 255 &&
    typeof payload.nonce === 'string' &&
    payload.nonce.length >= 32 &&
    payload.nonce.length <= 256 &&
    /^[A-Za-z0-9_-]+$/.test(payload.nonce)
  );
}

function diagnosticFromVerifiedPayload(
  substage: MicrosoftIdentityValidationDiagnostic['substage'],
  payload: JWTPayload,
  clientId: string,
  currentDate: Date,
  algorithm: string,
  matchingKidFound: boolean,
): MicrosoftIdentityValidationDiagnostic {
  return identityDiagnostic(substage, {
    algorithm,
    audienceMatch: exactAudience(payload.aud, clientId),
    issuerCategory: issuerCategory(payload.iss),
    matchingKidFound,
    requiredClaimsPresent: requiredIdentityClaimsPresent(payload),
    tenantMatch: payload.tid === MICROSOFT_ACCOUNT_TENANT_ID,
    timeValid: timeWindowValid(payload, currentDate),
    tokenVersion:
      payload.ver === '2.0'
        ? '2.0'
        : typeof payload.ver === 'string'
          ? 'unexpected'
          : 'absent',
  });
}

function joseErrorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function joseClaim(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'claim' in error &&
    typeof error.claim === 'string'
    ? error.claim
    : undefined;
}

function josePayload(error: unknown): JWTPayload | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'payload' in error &&
    error.payload !== null &&
    typeof error.payload === 'object'
    ? (error.payload as JWTPayload)
    : undefined;
}

export class MicrosoftConsumersOidcDiscovery {
  private cached?: Promise<MicrosoftConsumersOidcConfiguration>;

  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  public load(): Promise<MicrosoftConsumersOidcConfiguration> {
    this.cached ??= this.fetchConfiguration();
    return this.cached;
  }

  private async fetchConfiguration(): Promise<MicrosoftConsumersOidcConfiguration> {
    const response = await this.fetcher(OIDC_DISCOVERY_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('OIDC discovery unavailable.');
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== 'object')
      throw new Error('OIDC discovery invalid.');
    const candidate = value as Readonly<Record<string, unknown>>;
    const algorithms = candidate.id_token_signing_alg_values_supported;
    if (
      candidate.issuer !==
        `https://login.microsoftonline.com/${MICROSOFT_ACCOUNT_TENANT_ID}/v2.0` ||
      candidate.jwks_uri !==
        'https://login.microsoftonline.com/consumers/discovery/v2.0/keys' ||
      !Array.isArray(algorithms) ||
      algorithms.length !== 1 ||
      algorithms[0] !== 'RS256' ||
      algorithms.some(
        (algorithm) =>
          typeof algorithm !== 'string' ||
          !/^[A-Za-z0-9_-]{1,20}$/.test(algorithm),
      )
    )
      throw new Error('OIDC discovery invalid.');
    return {
      issuer: candidate.issuer,
      jwksUri: candidate.jwks_uri,
      signingAlgorithms: algorithms as string[],
    };
  }
}

export interface MicrosoftIdTokenValidator {
  validate(idToken: string): Promise<MicrosoftAuthorizationIdentity>;
}

export class MicrosoftIdTokenVerifier implements MicrosoftIdTokenValidator {
  private readonly currentDate: () => Date;
  private readonly keysFor: (jwksUri: URL) => JWTVerifyGetKey;
  private readonly loadConfiguration: () => Promise<MicrosoftConsumersOidcConfiguration>;

  public constructor(
    private readonly clientId: string,
    options: MicrosoftIdTokenVerifierOptions = {},
  ) {
    const discovery = new MicrosoftConsumersOidcDiscovery();
    this.currentDate = options.currentDate ?? (() => new Date());
    this.keysFor =
      options.keysFor ??
      ((jwksUri) =>
        createRemoteJWKSet(jwksUri, { timeoutDuration: TOKEN_TIMEOUT_MS }));
    this.loadConfiguration =
      options.loadConfiguration ?? (() => discovery.load());
  }

  public async validate(
    idToken: string,
  ): Promise<MicrosoftAuthorizationIdentity> {
    let configuration: MicrosoftConsumersOidcConfiguration;
    try {
      configuration = await this.loadConfiguration();
    } catch {
      throw identityValidationFailure(identityDiagnostic('discovery_metadata'));
    }
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(idToken);
    } catch {
      throw identityValidationFailure(identityDiagnostic('jwt_structure'));
    }
    const algorithm = safeAlgorithm(header.alg);
    if (
      typeof header.alg !== 'string' ||
      !configuration.signingAlgorithms.includes(header.alg)
    )
      throw identityValidationFailure(
        identityDiagnostic('signing_algorithm', { algorithm }),
      );
    if (typeof header.kid !== 'string' || header.kid.length < 1)
      throw identityValidationFailure(
        identityDiagnostic('kid_lookup', {
          algorithm,
          matchingKidFound: false,
        }),
      );

    const currentDate = this.currentDate();
    let matchingKidFound = false;
    const keys = this.keysFor(new URL(configuration.jwksUri));
    const trackedKeys: JWTVerifyGetKey = async (...arguments_) => {
      const key = await keys(...arguments_);
      matchingKidFound = true;
      return key;
    };
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, trackedKeys, {
        algorithms: [...configuration.signingAlgorithms],
        audience: this.clientId,
        clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
        currentDate,
        issuer: configuration.issuer,
        maxTokenAge: ID_TOKEN_MAX_AGE_SECONDS,
        requiredClaims: [
          'aud',
          'exp',
          'iat',
          'iss',
          'name',
          'nbf',
          'nonce',
          'oid',
          'sub',
          'tid',
          'ver',
        ],
      }));
    } catch (error) {
      const code = joseErrorCode(error);
      const claim = joseClaim(error);
      const verifiedPayload = josePayload(error);
      const substage =
        code === 'ERR_JWKS_NO_MATCHING_KEY'
          ? 'kid_lookup'
          : code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
            ? 'signature'
            : code === 'ERR_JOSE_ALG_NOT_ALLOWED'
              ? 'signing_algorithm'
              : claim === 'iss'
                ? 'issuer'
                : claim === 'aud'
                  ? 'audience'
                  : ['exp', 'nbf', 'iat'].includes(claim ?? '')
                    ? 'time_window'
                    : claim === 'ver'
                      ? 'token_version'
                      : claim === 'tid'
                        ? 'consumer_tenant'
                        : claim === 'nonce'
                          ? 'nonce'
                          : code === 'ERR_JWT_INVALID' ||
                              code === 'ERR_JWS_INVALID'
                            ? 'jwt_structure'
                            : 'required_identity_claims';
      throw identityValidationFailure(
        verifiedPayload
          ? diagnosticFromVerifiedPayload(
              substage,
              verifiedPayload,
              this.clientId,
              currentDate,
              algorithm,
              matchingKidFound,
            )
          : identityDiagnostic(substage, {
              algorithm,
              matchingKidFound:
                substage === 'kid_lookup' ? false : matchingKidFound,
            }),
      );
    }
    const verifiedDiagnostic = diagnosticFromVerifiedPayload(
      'required_identity_claims',
      payload,
      this.clientId,
      currentDate,
      algorithm,
      matchingKidFound,
    );
    if (payload.ver !== '2.0')
      throw identityValidationFailure({
        ...verifiedDiagnostic,
        substage: 'token_version',
      });
    if (payload.tid !== MICROSOFT_ACCOUNT_TENANT_ID)
      throw identityValidationFailure({
        ...verifiedDiagnostic,
        substage: 'consumer_tenant',
      });
    if (
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 32 ||
      payload.nonce.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(payload.nonce)
    )
      throw identityValidationFailure({
        ...verifiedDiagnostic,
        substage: 'nonce',
      });
    if (!requiredIdentityClaimsPresent(payload))
      throw identityValidationFailure(verifiedDiagnostic);
    return {
      displayName: payload.name as string,
      nonce: payload.nonce,
      providerSubjectId: microsoftProviderSubjectIdV1Schema.parse(payload.oid),
      validation: {
        ...verifiedDiagnostic,
        nonceMatch: null,
      },
    };
  }
}

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
  readonly id_token?: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope?: string;
}

function canonicalGraphPermission(
  value: string,
): MicrosoftGraphPermission | null {
  const withoutResource = value.replace(
    /^https:\/\/graph\.microsoft\.com\//i,
    '',
  );
  return (
    microsoftGraphPermissionV1Schema.options.find(
      (permission) =>
        permission.toLowerCase() === withoutResource.toLowerCase(),
    ) ?? null
  );
}

function isRequestedOidcMarker(
  value: string,
  requestedScopes: readonly MicrosoftRequestedScope[],
): boolean {
  return requestedScopes.some(
    (scope) =>
      ['openid', 'profile', 'offline_access'].includes(scope) &&
      scope.toLowerCase() === value.toLowerCase(),
  );
}

function validateGrantedGraphPermissions(
  scopeMetadata: string | undefined,
  requestedScopes: readonly MicrosoftRequestedScope[],
): readonly MicrosoftGraphPermission[] {
  if (scopeMetadata === undefined || scopeMetadata.trim().length === 0)
    throw new MicrosoftOAuthGatewayError(
      'authorization_failed',
      'scope_validation',
    );
  const canonical: MicrosoftGraphPermission[] = [];
  for (const claim of scopeMetadata.split(/\s+/).filter(Boolean)) {
    const permission = canonicalGraphPermission(claim);
    if (permission) {
      canonical.push(permission);
      continue;
    }
    if (isRequestedOidcMarker(claim, requestedScopes)) continue;
    throw new MicrosoftOAuthGatewayError(
      'authorization_failed',
      'scope_validation',
    );
  }
  const parsed = microsoftGraphPermissionsV1Schema.safeParse(canonical);
  if (!parsed.success)
    throw new MicrosoftOAuthGatewayError(
      'authorization_failed',
      'scope_validation',
    );
  const expected = expectedMicrosoftGraphPermissionsV1(requestedScopes);
  if (
    parsed.data.length !== expected.length ||
    expected.some((permission) => !parsed.data.includes(permission))
  )
    throw new MicrosoftOAuthGatewayError(
      'authorization_failed',
      'scope_validation',
    );
  return expected;
}

function tokenResponse(value: unknown): TokenEndpointResponse {
  if (!value || typeof value !== 'object')
    throw new MicrosoftOAuthGatewayError(
      'provider_unavailable',
      'token_response_validation',
    );
  const candidate = value as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.access_token !== 'string' ||
    candidate.access_token.length < 1 ||
    candidate.access_token.length > 16_384 ||
    (candidate.id_token !== undefined &&
      typeof candidate.id_token !== 'string') ||
    (candidate.refresh_token !== undefined &&
      typeof candidate.refresh_token !== 'string') ||
    typeof candidate.expires_in !== 'number' ||
    !Number.isFinite(candidate.expires_in) ||
    candidate.expires_in <= 0 ||
    (candidate.scope !== undefined && typeof candidate.scope !== 'string')
  )
    throw new MicrosoftOAuthGatewayError(
      'provider_unavailable',
      'token_response_validation',
    );
  return {
    access_token: candidate.access_token,
    ...(candidate.id_token === undefined
      ? {}
      : { id_token: candidate.id_token }),
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
    private readonly idTokens: MicrosoftIdTokenValidator = new MicrosoftIdTokenVerifier(
      configuration.clientId,
    ),
  ) {}

  public authorizationUrl(request: MicrosoftAuthorizationRequest): URL {
    if (request.redirectUri !== this.configuration.redirectUri)
      throw new MicrosoftOAuthGatewayError('authorization_failed');
    const scopes = microsoftRequestedScopesV1Schema.parse([...request.scopes]);
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: this.configuration.clientId,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      nonce: microsoftOidcNonceV1Schema.parse(request.nonce),
      redirect_uri: request.redirectUri,
      response_mode: 'form_post',
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
    requestedScopes: readonly MicrosoftRequestedScope[],
  ): Promise<MicrosoftAuthorizationGrant> {
    if (redirectUri !== this.configuration.redirectUri)
      throw new MicrosoftOAuthGatewayError(
        'authorization_failed',
        'token_exchange',
      );
    return this.requestToken(
      new URLSearchParams({
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: microsoftRequestedScopesV1Schema
          .parse([...requestedScopes])
          .join(' '),
      }),
      undefined,
      requestedScopes,
      true,
    );
  }

  public refresh(
    refreshToken: string,
    requestedScopes: readonly MicrosoftRequestedScope[] = MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  ): Promise<MicrosoftTokenGrant> {
    return this.requestToken(
      new URLSearchParams({
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: microsoftRequestedScopesV1Schema
          .parse([...requestedScopes])
          .join(' '),
      }),
      refreshToken,
      requestedScopes,
      false,
    );
  }

  private requestToken(
    form: URLSearchParams,
    priorRefreshToken: string | undefined,
    requestedScopes: readonly MicrosoftRequestedScope[],
    identityRequired: true,
  ): Promise<MicrosoftAuthorizationGrant>;
  private requestToken(
    form: URLSearchParams,
    priorRefreshToken: string | undefined,
    requestedScopes: readonly MicrosoftRequestedScope[],
    identityRequired: false,
  ): Promise<MicrosoftTokenGrant>;
  private async requestToken(
    form: URLSearchParams,
    priorRefreshToken: string | undefined,
    requestedScopes: readonly MicrosoftRequestedScope[],
    identityRequired: boolean,
  ): Promise<MicrosoftTokenGrant | MicrosoftAuthorizationGrant> {
    let response: Response;
    try {
      response = await this.fetcher(TOKEN_ENDPOINT, {
        body: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftOAuthGatewayError(
        'provider_unavailable',
        'token_exchange',
      );
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
        'token_exchange',
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new MicrosoftOAuthGatewayError(
        'provider_unavailable',
        'token_response_validation',
      );
    }
    const token = tokenResponse(raw);
    const refreshToken = token.refresh_token ?? priorRefreshToken;
    if (!refreshToken)
      throw new MicrosoftOAuthGatewayError(
        'authorization_failed',
        'token_response_validation',
      );
    const graphPermissions = validateGrantedGraphPermissions(
      token.scope,
      requestedScopes,
    );
    const baseGrant: MicrosoftTokenGrant = {
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
      graphPermissions,
      refreshToken,
    };
    if (!identityRequired) return baseGrant;
    if (!token.id_token)
      throw identityValidationFailure(identityDiagnostic('id_token_presence'));
    return {
      ...baseGrant,
      identity: await this.idTokens.validate(token.id_token),
    };
  }
}
