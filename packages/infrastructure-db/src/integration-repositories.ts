import {
  consentActionV1Schema,
  integrationAccountStatusV1Schema,
  microsoftDelegatedScopesV1Schema,
  userIdV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  ConsentRecord,
  ConsentRecordRepository,
  IntegrationAccountRecord,
  IntegrationAccountRepository,
  OAuthAuthorizationSessionRecord,
  OAuthAuthorizationSessionStore,
  UserScope,
} from '@meridian/domain';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { DatabaseClient } from './client.js';
import type { DatabaseExecutor } from './repositories.js';
import {
  consentRecords,
  integrationAccounts,
  oauthAuthorizationSessions,
} from './schema.js';

function mapIntegrationAccount(
  row: typeof integrationAccounts.$inferSelect,
  scope: UserScope,
): IntegrationAccountRecord {
  return {
    accessTokenCiphertext: row.accessTokenCiphertext,
    connectedAt: row.connectedAt,
    createdAt: row.createdAt,
    disconnectedAt: row.disconnectedAt,
    displayName: row.displayName,
    grantedScopes: microsoftDelegatedScopesV1Schema.parse(row.grantedScopes),
    id: uuidV1Schema.parse(row.id),
    lastRefreshedAt: row.lastRefreshedAt,
    provider: 'microsoft',
    providerSubjectId: row.providerSubjectId,
    refreshTokenCiphertext: row.refreshTokenCiphertext,
    scope,
    status: integrationAccountStatusV1Schema.parse(row.status),
    tokenExpiresAt: row.tokenExpiresAt,
    tokenKeyVersion: row.tokenKeyVersion,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleIntegrationAccountRepository implements IntegrationAccountRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findMicrosoft(
    scope: UserScope,
  ): Promise<IntegrationAccountRecord | null> {
    const [row] = await this.database
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.userId, scope.userId),
          eq(integrationAccounts.provider, 'microsoft'),
        ),
      )
      .limit(1);
    return row ? mapIntegrationAccount(row, scope) : null;
  }

  public async save(record: IntegrationAccountRecord): Promise<void> {
    await this.database
      .insert(integrationAccounts)
      .values({
        accessTokenCiphertext: record.accessTokenCiphertext,
        connectedAt: record.connectedAt,
        createdAt: record.createdAt,
        disconnectedAt: record.disconnectedAt,
        displayName: record.displayName,
        grantedScopes: [...record.grantedScopes],
        id: record.id,
        lastRefreshedAt: record.lastRefreshedAt,
        provider: record.provider,
        providerSubjectId: record.providerSubjectId,
        refreshTokenCiphertext: record.refreshTokenCiphertext,
        status: record.status,
        tokenExpiresAt: record.tokenExpiresAt,
        tokenKeyVersion: record.tokenKeyVersion,
        updatedAt: record.updatedAt,
        userId: record.scope.userId,
      })
      .onConflictDoUpdate({
        target: [integrationAccounts.userId, integrationAccounts.provider],
        set: {
          accessTokenCiphertext: record.accessTokenCiphertext,
          connectedAt: record.connectedAt,
          disconnectedAt: record.disconnectedAt,
          displayName: record.displayName,
          grantedScopes: [...record.grantedScopes],
          lastRefreshedAt: record.lastRefreshedAt,
          providerSubjectId: record.providerSubjectId,
          refreshTokenCiphertext: record.refreshTokenCiphertext,
          status: record.status,
          tokenExpiresAt: record.tokenExpiresAt,
          tokenKeyVersion: record.tokenKeyVersion,
          updatedAt: record.updatedAt,
        },
      });
  }
}

function mapConsent(
  row: typeof consentRecords.$inferSelect,
  scope: UserScope,
): ConsentRecord {
  return {
    action: consentActionV1Schema.parse(row.action),
    id: uuidV1Schema.parse(row.id),
    integrationAccountId: uuidV1Schema.parse(row.integrationAccountId),
    occurredAt: row.occurredAt,
    provider: 'microsoft',
    scope,
    scopes: microsoftDelegatedScopesV1Schema.parse(row.scopes),
  };
}

export class DrizzleConsentRecordRepository implements ConsentRecordRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async append(record: ConsentRecord): Promise<void> {
    await this.database.insert(consentRecords).values({
      action: record.action,
      id: record.id,
      integrationAccountId: record.integrationAccountId,
      occurredAt: record.occurredAt,
      provider: record.provider,
      scopes: [...record.scopes],
      userId: record.scope.userId,
    });
  }

  public async list(scope: UserScope): Promise<readonly ConsentRecord[]> {
    const rows = await this.database
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, scope.userId))
      .orderBy(desc(consentRecords.occurredAt));
    return rows.map((row) => mapConsent(row, scope));
  }
}

function mapAuthorizationSession(
  row: typeof oauthAuthorizationSessions.$inferSelect,
): OAuthAuthorizationSessionRecord {
  return {
    codeVerifierCiphertext: row.codeVerifierCiphertext,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: uuidV1Schema.parse(row.id),
    provider: 'microsoft',
    redirectUri: row.redirectUri,
    requestedScopes: microsoftDelegatedScopesV1Schema.parse(
      row.requestedScopes,
    ),
    stateHash: row.stateHash,
    userId: userIdV1Schema.parse(row.userId),
  };
}

export class DrizzleOAuthAuthorizationSessionStore implements OAuthAuthorizationSessionStore {
  public constructor(private readonly database: DatabaseClient) {}

  public create(record: OAuthAuthorizationSessionRecord): Promise<void> {
    return this.database.transaction(async (transaction) => {
      await transaction.insert(oauthAuthorizationSessions).values({
        codeVerifierCiphertext: record.codeVerifierCiphertext,
        consumedAt: record.consumedAt,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        id: record.id,
        provider: record.provider,
        redirectUri: record.redirectUri,
        requestedScopes: [...record.requestedScopes],
        stateHash: record.stateHash,
        userId: record.userId,
      });
    });
  }

  public consume(
    stateHash: string,
    consumedAt: Date,
  ): Promise<OAuthAuthorizationSessionRecord | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(oauthAuthorizationSessions)
        .where(
          and(
            eq(oauthAuthorizationSessions.stateHash, stateHash),
            isNull(oauthAuthorizationSessions.consumedAt),
            gt(oauthAuthorizationSessions.expiresAt, consumedAt),
          ),
        )
        .limit(1)
        .for('update');
      if (!row) return null;
      const updated = await transaction
        .update(oauthAuthorizationSessions)
        .set({
          codeVerifierCiphertext: 'v1.consumed',
          consumedAt,
        })
        .where(
          and(
            eq(oauthAuthorizationSessions.id, row.id),
            isNull(oauthAuthorizationSessions.consumedAt),
          ),
        )
        .returning({ id: oauthAuthorizationSessions.id });
      return updated.length === 1
        ? { ...mapAuthorizationSession(row), consumedAt }
        : null;
    });
  }
}
