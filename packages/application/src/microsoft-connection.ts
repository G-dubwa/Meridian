import {
  AuthenticationFailedError,
  ConflictError,
  IntegrationUnavailableError,
  MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
  MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  microsoftAuthorizationCodeV1Schema,
  microsoftAuthorizationStateV1Schema,
  microsoftConnectionEventPayloadV1Schema,
  expectedMicrosoftGraphPermissionsV1,
  microsoftGraphPermissionsV1Schema,
  microsoftRequestedScopesV1Schema,
  microsoftTodoRequestedScopesV1Schema,
  microsoftDisconnectionEventPayloadV1Schema,
  microsoftPkceChallengeV1Schema,
  microsoftPkceVerifierV1Schema,
  microsoftProfileV1Schema,
  outboxMessageIdV1Schema,
  userIdV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  ConsentAction,
  ConsentRecord,
  DomainEventEnvelopeV1,
  IdGenerator,
  IntegrationAccountRecord,
  MicrosoftGraphPermission,
  MicrosoftRequestedScope,
  MicrosoftIntegrationEventType,
  MicrosoftOAuthGateway,
  MicrosoftTokenGrant,
  OAuthAuthorizationSessionStore,
  OutboxMessageRecord,
  PkceGenerator,
  SecretService,
  TokenCipher,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

const AUTHORIZATION_SESSION_LIFETIME_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export interface MicrosoftAuthorizationRuntime {
  readonly cipher: TokenCipher;
  readonly gateway: MicrosoftOAuthGateway;
  readonly pkce: PkceGenerator;
  readonly redirectUri: string;
}

export interface MicrosoftConnectionServiceDependencies {
  readonly authorization?: MicrosoftAuthorizationRuntime;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly oauthSessions: OAuthAuthorizationSessionStore;
  readonly secrets: Pick<SecretService, 'generate' | 'hash'>;
  readonly transactions: TransactionManager;
}

export interface MicrosoftConnectionCommandContext {
  readonly correlationId: Uuid;
}

export interface MicrosoftConnectionSummary {
  readonly id: Uuid;
  readonly displayName: string;
  readonly status: IntegrationAccountRecord['status'];
  readonly requestedScopes: readonly MicrosoftRequestedScope[];
  readonly graphPermissions: readonly MicrosoftGraphPermission[];
  readonly connectedAt: Date;
  readonly disconnectedAt: Date | null;
  readonly lastRefreshedAt: Date | null;
}

export interface MicrosoftConsentSummary {
  readonly action: ConsentAction;
  readonly requestedScopes: readonly MicrosoftRequestedScope[];
  readonly graphPermissions: readonly MicrosoftGraphPermission[];
  readonly occurredAt: Date;
}

export interface MicrosoftConnectionStatusView {
  readonly configured: boolean;
  readonly account: MicrosoftConnectionSummary | null;
  readonly consentRecords: readonly MicrosoftConsentSummary[];
  readonly requestedScopes: readonly MicrosoftRequestedScope[];
}

function approvedRequestedScopes(
  scopes: readonly MicrosoftRequestedScope[] = MICROSOFT_STAGE_A_REQUESTED_SCOPES,
): readonly MicrosoftRequestedScope[] {
  const parsed = microsoftRequestedScopesV1Schema.parse([...scopes]);
  if (parsed.includes('Tasks.ReadWrite'))
    return microsoftTodoRequestedScopesV1Schema.parse(parsed);
  return parsed;
}

function exactSet(values: readonly string[], expected: readonly string[]) {
  return (
    values.length === expected.length &&
    expected.every((value) => values.includes(value))
  );
}

function tokenContext(
  scope: UserScope,
  accountId: Uuid,
  tokenType: 'access' | 'refresh',
): string {
  return `microsoft:${scope.userId}:${accountId}:${tokenType}`;
}

function flowContext(flowId: Uuid): string {
  return `microsoft:oauth-flow:${flowId}`;
}

function isConsentRevoked(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'reason' in error &&
    error.reason === 'consent_revoked'
  );
}

function summaryFor(
  account: IntegrationAccountRecord,
): MicrosoftConnectionSummary {
  return {
    connectedAt: account.connectedAt,
    disconnectedAt: account.disconnectedAt,
    displayName: account.displayName,
    graphPermissions: account.graphPermissions,
    id: account.id,
    lastRefreshedAt: account.lastRefreshedAt,
    status: account.status,
    requestedScopes: account.requestedScopes,
  };
}

function eventFor(
  dependencies: MicrosoftConnectionServiceDependencies,
  scope: UserScope,
  correlationId: Uuid,
  eventType: MicrosoftIntegrationEventType,
  occurredAt: Date,
  payload: Readonly<Record<string, unknown>>,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: occurredAt.toISOString(),
    payload,
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: MicrosoftConnectionServiceDependencies,
  ports: TransactionPorts,
  event: DomainEventEnvelopeV1,
  now: Date,
): Promise<void> {
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: now,
    createdAt: now,
    deadLetteredAt: null,
    event,
    id: outboxMessageIdV1Schema.parse(dependencies.ids.next()),
    lastErrorAt: null,
    lastErrorCode: null,
    processedAt: null,
    status: 'pending',
    topic: event.eventType,
  };
  await ports.domainEvents.append(event);
  await ports.outbox.append(outbox);
}

export class MicrosoftConnectionService {
  public constructor(
    private readonly dependencies: MicrosoftConnectionServiceDependencies,
  ) {}

  public status(scope: UserScope): Promise<MicrosoftConnectionStatusView> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const [account, consents] = await Promise.all([
        ports.integrationAccounts.findMicrosoft(scope),
        ports.consentRecords.list(scope),
      ]);
      return {
        account: account ? summaryFor(account) : null,
        configured: this.dependencies.authorization !== undefined,
        consentRecords: consents.map((record) => ({
          action: record.action,
          graphPermissions: record.graphPermissions,
          occurredAt: record.occurredAt,
          requestedScopes: record.requestedScopes,
        })),
        requestedScopes: approvedRequestedScopes(),
      };
    });
  }

  public async beginConnection(scope: UserScope): Promise<URL> {
    const authorization = this.requireAuthorization();
    const current = await this.dependencies.transactions.run(scope, (ports) =>
      ports.integrationAccounts.findMicrosoft(scope),
    );
    if (current?.status === 'connected')
      throw new ConflictError('Microsoft is already connected.');

    return this.beginAuthorizationFlow(
      scope,
      MICROSOFT_STAGE_A_REQUESTED_SCOPES,
      authorization,
    );
  }

  private async beginAuthorizationFlow(
    scope: UserScope,
    requestedScopes: readonly MicrosoftRequestedScope[],
    authorization: MicrosoftAuthorizationRuntime,
  ): Promise<URL> {
    const now = this.dependencies.clock.now();
    const flowId = uuidV1Schema.parse(this.dependencies.ids.next());
    const state = microsoftAuthorizationStateV1Schema.parse(
      this.dependencies.secrets.generate(32),
    );
    const pkce = authorization.pkce.generate();
    const verifier = microsoftPkceVerifierV1Schema.parse(pkce.verifier);
    const challenge = microsoftPkceChallengeV1Schema.parse(pkce.challenge);
    const scopes = approvedRequestedScopes(requestedScopes);
    await this.dependencies.oauthSessions.create({
      codeVerifierCiphertext: authorization.cipher.seal(
        verifier,
        flowContext(flowId),
      ),
      consumedAt: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_SESSION_LIFETIME_MS),
      id: flowId,
      provider: 'microsoft',
      redirectUri: authorization.redirectUri,
      requestedScopes: scopes,
      stateHash: this.dependencies.secrets.hash(state),
      userId: scope.userId,
    });
    return authorization.gateway.authorizationUrl({
      codeChallenge: challenge,
      redirectUri: authorization.redirectUri,
      scopes,
      state,
    });
  }

  public async beginTodoIncrementalConsent(scope: UserScope): Promise<URL> {
    const authorization = this.requireAuthorization();
    const current = await this.dependencies.transactions.run(scope, (ports) =>
      ports.integrationAccounts.findMicrosoft(scope),
    );
    if (
      !current ||
      !['connected', 'disconnected'].includes(current.status) ||
      !exactSet(current.requestedScopes, MICROSOFT_STAGE_A_REQUESTED_SCOPES) ||
      !exactSet(current.graphPermissions, MICROSOFT_STAGE_A_GRAPH_PERMISSIONS)
    )
      throw new ConflictError(
        'An exact Stage-A Microsoft account is required before incremental consent.',
      );
    return this.beginAuthorizationFlow(
      scope,
      MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
      authorization,
    );
  }

  public async completeConnection(
    stateInput: string,
    codeInput: string,
  ): Promise<UserScope> {
    const authorization = this.requireAuthorization();
    const state = microsoftAuthorizationStateV1Schema.parse(stateInput);
    const code = microsoftAuthorizationCodeV1Schema.parse(codeInput);
    const now = this.dependencies.clock.now();
    const flow = await this.dependencies.oauthSessions.consume(
      this.dependencies.secrets.hash(state),
      now,
    );
    if (!flow || flow.expiresAt <= now) throw new AuthenticationFailedError();
    if (flow.redirectUri !== authorization.redirectUri)
      throw new AuthenticationFailedError();

    const verifier = microsoftPkceVerifierV1Schema.parse(
      authorization.cipher.open(
        flow.codeVerifierCiphertext,
        flowContext(flow.id),
      ),
    );
    const grant = await authorization.gateway.exchangeAuthorizationCode(
      code,
      verifier,
      flow.redirectUri,
      flow.requestedScopes,
    );
    const requestedScopes = approvedRequestedScopes(flow.requestedScopes);
    const graphPermissions = microsoftGraphPermissionsV1Schema.parse([
      ...grant.graphPermissions,
    ]);
    const expectedGraphPermissions =
      expectedMicrosoftGraphPermissionsV1(requestedScopes);
    if (
      graphPermissions.length !== expectedGraphPermissions.length ||
      expectedGraphPermissions.some(
        (permission) => !graphPermissions.includes(permission),
      )
    )
      throw new AuthenticationFailedError();
    const profile = microsoftProfileV1Schema.parse(
      await authorization.gateway.readProfile(grant.accessToken),
    );
    const scope = { userId: userIdV1Schema.parse(flow.userId) };

    await this.dependencies.transactions.run(scope, async (ports) => {
      const existing = await ports.integrationAccounts.findMicrosoft(scope);
      const accountId = uuidV1Schema.parse(
        existing?.id ?? this.dependencies.ids.next(),
      );
      const account: IntegrationAccountRecord = {
        accessTokenCiphertext: authorization.cipher.seal(
          grant.accessToken,
          tokenContext(scope, accountId, 'access'),
        ),
        connectedAt: now,
        createdAt: existing?.createdAt ?? now,
        disconnectedAt: null,
        displayName: profile.displayName,
        graphPermissions,
        id: accountId,
        lastRefreshedAt: null,
        provider: 'microsoft',
        providerSubjectId: profile.providerSubjectId,
        requestedScopes,
        refreshTokenCiphertext: authorization.cipher.seal(
          grant.refreshToken,
          tokenContext(scope, accountId, 'refresh'),
        ),
        scope,
        status: 'connected',
        tokenExpiresAt: new Date(now.getTime() + grant.expiresInSeconds * 1000),
        tokenKeyVersion: 1,
        updatedAt: now,
      };
      await ports.integrationAccounts.save(account);
      await ports.consentRecords.append({
        action: 'granted',
        id: uuidV1Schema.parse(this.dependencies.ids.next()),
        integrationAccountId: accountId,
        occurredAt: now,
        provider: 'microsoft',
        scope,
        graphPermissions,
        requestedScopes,
      });
      const payload = microsoftConnectionEventPayloadV1Schema.parse({
        integrationAccountId: accountId,
        graphPermissions,
        requestedScopes,
      });
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          flow.id,
          'integration.microsoft_connected.v1',
          now,
          payload,
        ),
        now,
      );
    });
    return scope;
  }

  public disconnect(
    scope: UserScope,
    confirmation: string,
    context: MicrosoftConnectionCommandContext,
  ): Promise<MicrosoftConnectionStatusView> {
    if (confirmation !== 'DISCONNECT') throw new AuthenticationFailedError();
    return this.dependencies.transactions.run(scope, async (ports) => {
      const existing = await ports.integrationAccounts.findMicrosoft(scope);
      if (!existing) throw new ConflictError('Microsoft is not connected.');
      if (existing.status !== 'disconnected') {
        const now = this.dependencies.clock.now();
        await ports.integrationAccounts.save({
          ...existing,
          accessTokenCiphertext: null,
          disconnectedAt: now,
          refreshTokenCiphertext: null,
          status: 'disconnected',
          tokenExpiresAt: null,
          updatedAt: now,
        });
        const todoList = await ports.microsoftTodoListBindings.find(scope);
        if (todoList && todoList.status !== 'cleaned')
          await ports.microsoftTodoListBindings.save({
            ...todoList,
            status: 'unmanaged',
            updatedAt: now,
            version: todoList.version + 1,
          });
        await ports.consentRecords.append({
          action: 'disconnected',
          id: uuidV1Schema.parse(this.dependencies.ids.next()),
          integrationAccountId: existing.id,
          occurredAt: now,
          provider: 'microsoft',
          scope,
          graphPermissions: existing.graphPermissions,
          requestedScopes: existing.requestedScopes,
        });
        const payload = microsoftDisconnectionEventPayloadV1Schema.parse({
          integrationAccountId: existing.id,
        });
        await appendEvent(
          this.dependencies,
          ports,
          eventFor(
            this.dependencies,
            scope,
            context.correlationId,
            'integration.microsoft_disconnected.v1',
            now,
            payload,
          ),
          now,
        );
      }
      const account = await ports.integrationAccounts.findMicrosoft(scope);
      const consents = await ports.consentRecords.list(scope);
      return {
        account: account ? summaryFor(account) : null,
        configured: this.dependencies.authorization !== undefined,
        consentRecords: consents.map((record) => ({
          action: record.action,
          occurredAt: record.occurredAt,
          graphPermissions: record.graphPermissions,
          requestedScopes: record.requestedScopes,
        })),
        requestedScopes: approvedRequestedScopes(),
      };
    });
  }

  public async accessTokenFor(scope: UserScope): Promise<string> {
    const authorization = this.requireAuthorization();
    const account = await this.dependencies.transactions.run(scope, (ports) =>
      ports.integrationAccounts.findMicrosoft(scope),
    );
    if (
      account?.status !== 'connected' ||
      !account.accessTokenCiphertext ||
      !account.refreshTokenCiphertext ||
      !account.tokenExpiresAt
    )
      throw new IntegrationUnavailableError();
    const now = this.dependencies.clock.now();
    if (
      account.tokenExpiresAt.getTime() - now.getTime() >
      ACCESS_TOKEN_REFRESH_WINDOW_MS
    )
      return authorization.cipher.open(
        account.accessTokenCiphertext,
        tokenContext(scope, account.id, 'access'),
      );

    const refreshToken = authorization.cipher.open(
      account.refreshTokenCiphertext,
      tokenContext(scope, account.id, 'refresh'),
    );
    try {
      const grant = await authorization.gateway.refresh(
        refreshToken,
        account.requestedScopes,
      );
      return await this.persistRefresh(scope, account, grant, now);
    } catch (error) {
      if (isConsentRevoked(error)) {
        await this.markReauthorizationRequired(scope, account, now);
        throw new IntegrationUnavailableError();
      }
      throw error;
    }
  }

  private async persistRefresh(
    scope: UserScope,
    account: IntegrationAccountRecord,
    grant: MicrosoftTokenGrant,
    now: Date,
  ): Promise<string> {
    const authorization = this.requireAuthorization();
    const graphPermissions = microsoftGraphPermissionsV1Schema.parse([
      ...grant.graphPermissions,
    ]);
    const expectedGraphPermissions = expectedMicrosoftGraphPermissionsV1(
      account.requestedScopes,
    );
    if (
      graphPermissions.length !== expectedGraphPermissions.length ||
      expectedGraphPermissions.some(
        (permission) => !graphPermissions.includes(permission),
      )
    )
      throw new AuthenticationFailedError();
    await this.dependencies.transactions.run(scope, async (ports) => {
      await ports.integrationAccounts.save({
        ...account,
        accessTokenCiphertext: authorization.cipher.seal(
          grant.accessToken,
          tokenContext(scope, account.id, 'access'),
        ),
        graphPermissions,
        lastRefreshedAt: now,
        refreshTokenCiphertext: authorization.cipher.seal(
          grant.refreshToken,
          tokenContext(scope, account.id, 'refresh'),
        ),
        tokenExpiresAt: new Date(now.getTime() + grant.expiresInSeconds * 1000),
        updatedAt: now,
      });
    });
    return grant.accessToken;
  }

  private markReauthorizationRequired(
    scope: UserScope,
    account: IntegrationAccountRecord,
    now: Date,
  ): Promise<void> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.integrationAccounts.save({
        ...account,
        accessTokenCiphertext: null,
        refreshTokenCiphertext: null,
        status: 'reauthorization_required',
        tokenExpiresAt: null,
        updatedAt: now,
      });
      const todoList = await ports.microsoftTodoListBindings.find(scope);
      if (todoList?.status === 'experimental')
        await ports.microsoftTodoListBindings.save({
          ...todoList,
          status: 'suspended',
          updatedAt: now,
          version: todoList.version + 1,
        });
      const consent: ConsentRecord = {
        action: 'reauthorization_required',
        id: uuidV1Schema.parse(this.dependencies.ids.next()),
        integrationAccountId: account.id,
        occurredAt: now,
        provider: 'microsoft',
        scope,
        graphPermissions: account.graphPermissions,
        requestedScopes: account.requestedScopes,
      };
      await ports.consentRecords.append(consent);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          consent.id,
          'integration.microsoft_reauthorization_required.v1',
          now,
          microsoftDisconnectionEventPayloadV1Schema.parse({
            integrationAccountId: account.id,
          }),
        ),
        now,
      );
    });
  }

  private requireAuthorization(): MicrosoftAuthorizationRuntime {
    if (!this.dependencies.authorization)
      throw new IntegrationUnavailableError();
    return this.dependencies.authorization;
  }
}
