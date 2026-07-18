import {
  AuthenticationFailedError,
  BootstrapCompleteError,
  CsrfInvalidError,
  RateLimitedError,
  SessionInvalidError,
  authIdentifierV1Schema,
  authPassphraseV1Schema,
  sessionIdV1Schema,
  userIdV1Schema,
} from '@meridian/domain';
import type {
  AuthCredentialRecord,
  AuthEventRecord,
  AuthFailureReason,
  AuthIdentifier,
  AuthSessionRecord,
  AuthenticationTransactionManager,
  AuthenticationTransactionPorts,
  Clock,
  IdGenerator,
  PasswordHasher,
  RecoveryCode,
  RecoveryCodeRecord,
  SecretService,
  UserId,
  UserRecord,
  Uuid,
} from '@meridian/domain';

const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_BLOCK_MS = 15 * 60 * 1000;
const AUTH_RATE_MAXIMUM = 10;
const CREDENTIAL_FAILURE_LIMIT = 5;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

export interface AuthRequestContext {
  readonly requestId: Uuid;
  readonly clientFingerprintHash: string;
}

export interface SessionGrant {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface BootstrapOwnerInput {
  readonly identifier: string;
  readonly passphrase: string;
  readonly homeTimeZone: string;
  readonly locale: string;
}

export interface BootstrapOwnerResult {
  readonly userId: UserId;
  readonly recoveryCodes: readonly RecoveryCode[];
}

export interface LoginInput {
  readonly identifier: string;
  readonly passphrase: string;
}

export interface RecoveryLoginInput {
  readonly identifier: string;
  readonly recoveryCode: RecoveryCode;
}

export interface AuthenticatedSession {
  readonly record: AuthSessionRecord;
  readonly identifier: AuthIdentifier;
  readonly activeSessionCount: number;
}

export interface AuthenticationServiceDependencies {
  readonly transactions: AuthenticationTransactionManager;
  readonly passwords: PasswordHasher;
  readonly secrets: SecretService;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function makeAuditEvent(
  dependencies: AuthenticationServiceDependencies,
  context: AuthRequestContext,
  input: Omit<AuthEventRecord, 'id' | 'requestId' | 'clientFingerprintHash'>,
): AuthEventRecord {
  return {
    ...input,
    clientFingerprintHash: context.clientFingerprintHash,
    id: dependencies.ids.next(),
    requestId: context.requestId,
  };
}

function makeSession(
  dependencies: AuthenticationServiceDependencies,
  userId: UserId,
  now: Date,
): { grant: SessionGrant; record: AuthSessionRecord } {
  const sessionToken = dependencies.secrets.generate(32);
  const csrfToken = dependencies.secrets.generate(32);
  const idleExpiresAt = addMilliseconds(now, SESSION_IDLE_MS);
  const absoluteExpiresAt = addMilliseconds(now, SESSION_ABSOLUTE_MS);
  return {
    grant: {
      absoluteExpiresAt,
      csrfToken,
      idleExpiresAt,
      sessionToken,
    },
    record: {
      absoluteExpiresAt,
      createdAt: now,
      csrfTokenHash: dependencies.secrets.hash(csrfToken),
      id: sessionIdV1Schema.parse(dependencies.ids.next()),
      idleExpiresAt,
      lastSeenAt: now,
      revokedAt: null,
      tokenHash: dependencies.secrets.hash(sessionToken),
      userId,
    },
  };
}

function sessionIsActive(record: AuthSessionRecord, now: Date): boolean {
  return (
    record.revokedAt === null &&
    record.idleExpiresAt > now &&
    record.absoluteExpiresAt > now
  );
}

export class AuthenticationService {
  public constructor(
    private readonly dependencies: AuthenticationServiceDependencies,
  ) {}

  public async bootstrapOwner(
    input: BootstrapOwnerInput,
    context: AuthRequestContext,
  ): Promise<BootstrapOwnerResult> {
    const identifier = authIdentifierV1Schema.parse(input.identifier);
    const passphrase = authPassphraseV1Schema.parse(input.passphrase);
    const now = this.dependencies.clock.now();
    const userId = userIdV1Schema.parse(this.dependencies.ids.next());
    const passwordHash = await this.dependencies.passwords.hash(passphrase);
    const credential: AuthCredentialRecord = {
      createdAt: now,
      failedAttempts: 0,
      id: this.dependencies.ids.next(),
      identifier,
      lockedUntil: null,
      passwordChangedAt: now,
      passwordHash,
      updatedAt: now,
      userId,
    };
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      this.dependencies.secrets.generateRecoveryCode(),
    );
    const recoveryRecords: RecoveryCodeRecord[] = recoveryCodes.map((code) => ({
      codeHash: this.dependencies.secrets.hash(code),
      createdAt: now,
      id: this.dependencies.ids.next(),
      usedAt: null,
      userId,
    }));
    const user: UserRecord = {
      createdAt: now,
      homeTimeZone: input.homeTimeZone,
      id: userId,
      locale: input.locale,
      settings: {},
      softActiveGoalLimit: 5,
      updatedAt: now,
    };

    const created = await this.dependencies.transactions.run(async (ports) => {
      if (await ports.bootstrap.exists()) return false;
      await ports.bootstrap.create(user, credential, recoveryRecords);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'owner_bootstrapped',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId,
        }),
      );
      return true;
    });
    if (!created) throw new BootstrapCompleteError();
    return { recoveryCodes, userId };
  }

  public async login(
    input: LoginInput,
    context: AuthRequestContext,
  ): Promise<SessionGrant> {
    const identifier = authIdentifierV1Schema.parse(input.identifier);
    const passphrase = authPassphraseV1Schema.parse(input.passphrase);
    const result = await this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const rateLimit = await ports.rateLimits.consume(
        this.rateLimitKey(identifier, context),
        now,
        AUTH_RATE_WINDOW_MS,
        AUTH_RATE_MAXIMUM,
        AUTH_RATE_BLOCK_MS,
      );
      if (!rateLimit.allowed) {
        await this.auditRejected(ports, context, null, now, 'rate_limited');
        return { failure: 'rate_limited' as const, retryAt: rateLimit.retryAt };
      }

      const credential = await ports.credentials.findByIdentifier(identifier);
      if (!credential) {
        await this.dependencies.passwords.hash(passphrase);
        await this.auditRejected(
          ports,
          context,
          null,
          now,
          'credentials_invalid',
        );
        return { failure: 'credentials_invalid' as const };
      }

      const passwordMatches = await this.dependencies.passwords.verify(
        credential.passwordHash,
        passphrase,
      );
      if (credential.lockedUntil && credential.lockedUntil > now) {
        await this.auditRejected(
          ports,
          context,
          credential.userId,
          now,
          'credential_locked',
        );
        return { failure: 'credentials_invalid' as const };
      }
      if (!passwordMatches) {
        const failures = credential.failedAttempts + 1;
        await ports.credentials.save({
          ...credential,
          failedAttempts: failures,
          lockedUntil:
            failures >= CREDENTIAL_FAILURE_LIMIT
              ? addMilliseconds(now, AUTH_RATE_BLOCK_MS)
              : null,
          updatedAt: now,
        });
        await this.auditRejected(
          ports,
          context,
          credential.userId,
          now,
          'credentials_invalid',
        );
        return { failure: 'credentials_invalid' as const };
      }

      await ports.credentials.save({
        ...credential,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      });
      const session = makeSession(this.dependencies, credential.userId, now);
      await ports.sessions.save(session.record);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'login_succeeded',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: credential.userId,
        }),
      );
      return { grant: session.grant };
    });

    if ('grant' in result) return result.grant;
    if (result.failure === 'rate_limited')
      throw new RateLimitedError(result.retryAt);
    throw new AuthenticationFailedError();
  }

  public async recover(
    input: RecoveryLoginInput,
    context: AuthRequestContext,
  ): Promise<SessionGrant> {
    const identifier = authIdentifierV1Schema.parse(input.identifier);
    const result = await this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const rateLimit = await ports.rateLimits.consume(
        this.rateLimitKey(identifier, context),
        now,
        AUTH_RATE_WINDOW_MS,
        AUTH_RATE_MAXIMUM,
        AUTH_RATE_BLOCK_MS,
      );
      if (!rateLimit.allowed) {
        await this.auditRejected(ports, context, null, now, 'rate_limited');
        return { failure: 'rate_limited' as const, retryAt: rateLimit.retryAt };
      }
      const credential = await ports.credentials.findByIdentifier(identifier);
      if (!credential) {
        this.dependencies.secrets.hash(input.recoveryCode);
        await this.auditRejected(
          ports,
          context,
          null,
          now,
          'recovery_code_invalid',
        );
        return { failure: 'recovery_code_invalid' as const };
      }
      const codes = await ports.recoveryCodes.findActiveByUserId(
        credential.userId,
      );
      const matching = codes.find((code) =>
        this.dependencies.secrets.matches(code.codeHash, input.recoveryCode),
      );
      if (!matching || !(await ports.recoveryCodes.consume(matching.id, now))) {
        await this.auditRejected(
          ports,
          context,
          credential.userId,
          now,
          'recovery_code_invalid',
        );
        return { failure: 'recovery_code_invalid' as const };
      }

      await ports.sessions.revokeForUser(credential.userId, now);
      await ports.credentials.save({
        ...credential,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      });
      const session = makeSession(this.dependencies, credential.userId, now);
      await ports.sessions.save(session.record);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'recovery_code_used',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: credential.userId,
        }),
      );
      return { grant: session.grant };
    });
    if ('grant' in result) return result.grant;
    if (result.failure === 'rate_limited')
      throw new RateLimitedError(result.retryAt);
    throw new AuthenticationFailedError();
  }

  public validateSession(
    sessionToken: string,
    csrfToken?: string,
  ): Promise<AuthenticatedSession> {
    return this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const record = await ports.sessions.findByTokenHash(
        this.dependencies.secrets.hash(sessionToken),
      );
      if (!record || !sessionIsActive(record, now))
        throw new SessionInvalidError();
      if (
        csrfToken !== undefined &&
        !this.dependencies.secrets.matches(record.csrfTokenHash, csrfToken)
      )
        throw new CsrfInvalidError();

      let effectiveRecord = record;
      if (now.getTime() - record.lastSeenAt.getTime() >= SESSION_TOUCH_MS) {
        effectiveRecord = {
          ...record,
          idleExpiresAt: new Date(
            Math.min(
              addMilliseconds(now, SESSION_IDLE_MS).getTime(),
              record.absoluteExpiresAt.getTime(),
            ),
          ),
          lastSeenAt: now,
        };
        await ports.sessions.save(effectiveRecord);
      }
      const credential = await ports.credentials.findByUserId(record.userId);
      if (!credential) throw new SessionInvalidError();
      return {
        activeSessionCount: await ports.sessions.countActiveForUser(
          record.userId,
          now,
        ),
        identifier: credential.identifier,
        record: effectiveRecord,
      };
    });
  }

  public async renewSession(
    sessionToken: string,
    csrfToken: string,
    context: AuthRequestContext,
  ): Promise<SessionGrant> {
    return this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const current = await this.requireSession(
        ports,
        sessionToken,
        csrfToken,
        now,
      );
      const replacement = makeSession(this.dependencies, current.userId, now);
      await ports.sessions.revoke(current.id, now);
      await ports.sessions.save(replacement.record);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'session_renewed',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: current.userId,
        }),
      );
      return replacement.grant;
    });
  }

  public async logout(
    sessionToken: string,
    csrfToken: string,
    context: AuthRequestContext,
  ): Promise<void> {
    await this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const current = await this.requireSession(
        ports,
        sessionToken,
        csrfToken,
        now,
      );
      await ports.sessions.revoke(current.id, now);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'logout',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: current.userId,
        }),
      );
    });
  }

  public async changePassword(
    sessionToken: string,
    csrfToken: string,
    currentPassphrase: string,
    newPassphrase: string,
    context: AuthRequestContext,
  ): Promise<void> {
    const currentPassword = authPassphraseV1Schema.parse(currentPassphrase);
    const newPassword = authPassphraseV1Schema.parse(newPassphrase);
    await this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const session = await this.requireSession(
        ports,
        sessionToken,
        csrfToken,
        now,
      );
      const credential = await ports.credentials.findByUserId(session.userId);
      if (
        !credential ||
        !(await this.dependencies.passwords.verify(
          credential.passwordHash,
          currentPassword,
        ))
      )
        throw new AuthenticationFailedError();
      await ports.credentials.save({
        ...credential,
        passwordChangedAt: now,
        passwordHash: await this.dependencies.passwords.hash(newPassword),
        updatedAt: now,
      });
      await ports.sessions.revokeForUser(session.userId, now, session.id);
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'password_changed',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: session.userId,
        }),
      );
    });
  }

  public async revokeSessions(
    sessionToken: string,
    csrfToken: string,
    includeCurrent: boolean,
    context: AuthRequestContext,
  ): Promise<{ signedOut: boolean }> {
    return this.dependencies.transactions.run(async (ports) => {
      const now = this.dependencies.clock.now();
      const session = await this.requireSession(
        ports,
        sessionToken,
        csrfToken,
        now,
      );
      if (includeCurrent) {
        await ports.sessions.revokeForUser(session.userId, now);
      } else {
        await ports.sessions.revokeForUser(session.userId, now, session.id);
      }
      await ports.events.append(
        makeAuditEvent(this.dependencies, context, {
          eventType: 'sessions_revoked',
          occurredAt: now,
          outcome: 'succeeded',
          reasonCode: null,
          userId: session.userId,
        }),
      );
      return { signedOut: includeCurrent };
    });
  }

  private rateLimitKey(
    identifier: AuthIdentifier,
    context: AuthRequestContext,
  ): string {
    return this.dependencies.secrets.hash(
      `${identifier}:${context.clientFingerprintHash}`,
    );
  }

  private async auditRejected(
    ports: AuthenticationTransactionPorts,
    context: AuthRequestContext,
    userId: UserId | null,
    occurredAt: Date,
    reasonCode: AuthFailureReason,
  ): Promise<void> {
    await ports.events.append(
      makeAuditEvent(this.dependencies, context, {
        eventType: 'login_failed',
        occurredAt,
        outcome: 'rejected',
        reasonCode,
        userId,
      }),
    );
  }

  private async requireSession(
    ports: AuthenticationTransactionPorts,
    sessionToken: string,
    csrfToken: string,
    now: Date,
  ): Promise<AuthSessionRecord> {
    const record = await ports.sessions.findByTokenHash(
      this.dependencies.secrets.hash(sessionToken),
    );
    if (!record || !sessionIsActive(record, now))
      throw new SessionInvalidError();
    if (!this.dependencies.secrets.matches(record.csrfTokenHash, csrfToken))
      throw new CsrfInvalidError();
    return record;
  }
}

export const authenticationPolicy = {
  absoluteSessionMilliseconds: SESSION_ABSOLUTE_MS,
  credentialFailureLimit: CREDENTIAL_FAILURE_LIMIT,
  idleSessionMilliseconds: SESSION_IDLE_MS,
  recoveryCodeCount: RECOVERY_CODE_COUNT,
} as const;
