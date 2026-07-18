import {
  authIdentifierV1Schema,
  sessionIdV1Schema,
  userIdV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  AuthCredentialRecord,
  AuthCredentialRepository,
  AuthEventRecord,
  AuthEventRepository,
  AuthRateLimitRepository,
  AuthSessionRecord,
  AuthSessionRepository,
  OwnerBootstrapRepository,
  RateLimitDecision,
  RecoveryCodeRecord,
  RecoveryCodeRepository,
  SessionId,
  UserId,
  UserRecord,
  Uuid,
} from '@meridian/domain';
import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import {
  authCredentials,
  authEvents,
  authRateLimits,
  authSessions,
  recoveryCodes,
  users,
} from './schema.js';

export class DrizzleOwnerBootstrapRepository implements OwnerBootstrapRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async exists(): Promise<boolean> {
    const [row] = await this.database
      .select({ count: count() })
      .from(authCredentials);
    return (row?.count ?? 0) > 0;
  }

  public async create(
    user: UserRecord,
    credential: AuthCredentialRecord,
    codes: readonly RecoveryCodeRecord[],
  ): Promise<void> {
    await this.database.execute(
      sql`select set_config('meridian.user_id', ${user.id}, true)`,
    );
    await this.database.insert(users).values({
      createdAt: user.createdAt,
      homeTimeZone: user.homeTimeZone,
      id: user.id,
      locale: user.locale,
      settings: user.settings,
      softActiveGoalLimit: user.softActiveGoalLimit,
      updatedAt: user.updatedAt,
    });
    await this.database.insert(authCredentials).values({
      createdAt: credential.createdAt,
      failedAttempts: credential.failedAttempts,
      id: credential.id,
      identifier: credential.identifier,
      lockedUntil: credential.lockedUntil,
      passwordChangedAt: credential.passwordChangedAt,
      passwordHash: credential.passwordHash,
      updatedAt: credential.updatedAt,
      userId: credential.userId,
    });
    if (codes.length > 0)
      await this.database.insert(recoveryCodes).values([...codes]);
  }
}

function mapCredential(
  row: typeof authCredentials.$inferSelect,
): AuthCredentialRecord {
  return {
    createdAt: row.createdAt,
    failedAttempts: row.failedAttempts,
    id: uuidV1Schema.parse(row.id),
    identifier: authIdentifierV1Schema.parse(row.identifier),
    lockedUntil: row.lockedUntil,
    passwordChangedAt: row.passwordChangedAt,
    passwordHash: row.passwordHash,
    updatedAt: row.updatedAt,
    userId: userIdV1Schema.parse(row.userId),
  };
}

export class DrizzleAuthCredentialRepository implements AuthCredentialRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findByIdentifier(
    identifier: AuthCredentialRecord['identifier'],
  ): Promise<AuthCredentialRecord | null> {
    const [row] = await this.database
      .select()
      .from(authCredentials)
      .where(eq(authCredentials.identifier, identifier))
      .limit(1);
    return row ? mapCredential(row) : null;
  }

  public async findByUserId(
    userId: UserId,
  ): Promise<AuthCredentialRecord | null> {
    const [row] = await this.database
      .select()
      .from(authCredentials)
      .where(eq(authCredentials.userId, userId))
      .limit(1);
    return row ? mapCredential(row) : null;
  }

  public async save(record: AuthCredentialRecord): Promise<void> {
    await this.database
      .insert(authCredentials)
      .values({
        createdAt: record.createdAt,
        failedAttempts: record.failedAttempts,
        id: record.id,
        identifier: record.identifier,
        lockedUntil: record.lockedUntil,
        passwordChangedAt: record.passwordChangedAt,
        passwordHash: record.passwordHash,
        updatedAt: record.updatedAt,
        userId: record.userId,
      })
      .onConflictDoUpdate({
        target: authCredentials.id,
        set: {
          failedAttempts: record.failedAttempts,
          lockedUntil: record.lockedUntil,
          passwordChangedAt: record.passwordChangedAt,
          passwordHash: record.passwordHash,
          updatedAt: record.updatedAt,
        },
      });
  }
}

function mapRecoveryCode(
  row: typeof recoveryCodes.$inferSelect,
): RecoveryCodeRecord {
  return {
    codeHash: row.codeHash,
    createdAt: row.createdAt,
    id: uuidV1Schema.parse(row.id),
    usedAt: row.usedAt,
    userId: userIdV1Schema.parse(row.userId),
  };
}

export class DrizzleRecoveryCodeRepository implements RecoveryCodeRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findActiveByUserId(
    userId: UserId,
  ): Promise<readonly RecoveryCodeRecord[]> {
    const rows = await this.database
      .select()
      .from(recoveryCodes)
      .where(
        and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)),
      );
    return rows.map(mapRecoveryCode);
  }

  public async consume(id: Uuid, usedAt: Date): Promise<boolean> {
    const rows = await this.database
      .update(recoveryCodes)
      .set({ usedAt })
      .where(and(eq(recoveryCodes.id, id), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    return rows.length === 1;
  }
}

function mapSession(row: typeof authSessions.$inferSelect): AuthSessionRecord {
  return {
    absoluteExpiresAt: row.absoluteExpiresAt,
    createdAt: row.createdAt,
    csrfTokenHash: row.csrfTokenHash,
    id: sessionIdV1Schema.parse(row.id),
    idleExpiresAt: row.idleExpiresAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    tokenHash: row.tokenHash,
    userId: userIdV1Schema.parse(row.userId),
  };
}

export class DrizzleAuthSessionRepository implements AuthSessionRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findByTokenHash(
    tokenHash: string,
  ): Promise<AuthSessionRecord | null> {
    const [row] = await this.database
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? mapSession(row) : null;
  }

  public async save(record: AuthSessionRecord): Promise<void> {
    await this.database
      .insert(authSessions)
      .values(record)
      .onConflictDoUpdate({
        target: authSessions.id,
        set: {
          absoluteExpiresAt: record.absoluteExpiresAt,
          csrfTokenHash: record.csrfTokenHash,
          idleExpiresAt: record.idleExpiresAt,
          lastSeenAt: record.lastSeenAt,
          revokedAt: record.revokedAt,
          tokenHash: record.tokenHash,
        },
      });
  }

  public async revoke(id: SessionId, revokedAt: Date): Promise<void> {
    await this.database
      .update(authSessions)
      .set({ revokedAt })
      .where(eq(authSessions.id, id));
  }

  public async revokeForUser(
    userId: UserId,
    revokedAt: Date,
    exceptSessionId?: SessionId,
  ): Promise<void> {
    const ownerCondition = and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
    );
    await this.database
      .update(authSessions)
      .set({ revokedAt })
      .where(
        exceptSessionId
          ? and(ownerCondition, ne(authSessions.id, exceptSessionId))
          : ownerCondition,
      );
  }

  public async countActiveForUser(userId: UserId, at: Date): Promise<number> {
    const [row] = await this.database
      .select({ count: count() })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.idleExpiresAt, at),
          gt(authSessions.absoluteExpiresAt, at),
        ),
      );
    return row?.count ?? 0;
  }
}

export class DrizzleAuthRateLimitRepository implements AuthRateLimitRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async consume(
    keyHash: string,
    at: Date,
    windowMilliseconds: number,
    maximumAttempts: number,
    blockMilliseconds: number,
  ): Promise<RateLimitDecision> {
    await this.database
      .insert(authRateLimits)
      .values({ attempts: 0, keyHash, updatedAt: at, windowStartedAt: at })
      .onConflictDoNothing();
    const [current] = await this.database
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.keyHash, keyHash))
      .limit(1)
      .for('update');
    if (!current) throw new Error('Rate limit row was not created.');
    if (current.blockedUntil && current.blockedUntil > at)
      return { allowed: false, retryAt: current.blockedUntil };

    const windowExpired =
      at.getTime() - current.windowStartedAt.getTime() >= windowMilliseconds;
    const attempts = windowExpired ? 1 : current.attempts + 1;
    const blockedUntil =
      attempts > maximumAttempts
        ? new Date(at.getTime() + blockMilliseconds)
        : null;
    await this.database
      .update(authRateLimits)
      .set({
        attempts,
        blockedUntil,
        updatedAt: at,
        windowStartedAt: windowExpired ? at : current.windowStartedAt,
      })
      .where(eq(authRateLimits.keyHash, keyHash));
    return {
      allowed: blockedUntil === null,
      retryAt: blockedUntil,
    };
  }
}

export class DrizzleAuthEventRepository implements AuthEventRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async append(record: AuthEventRecord): Promise<void> {
    await this.database.insert(authEvents).values(record);
  }
}
