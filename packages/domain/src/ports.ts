import type { DomainEventEnvelopeV1 } from './events.js';
import type {
  AuthEventOutcome,
  AuthEventType,
  AuthFailureReason,
  AuthIdentifier,
  RecoveryCode,
} from './auth.js';
import type { JournalEntryStatus } from './journal.js';
import type {
  DerivationLinkId,
  EntryId,
  EntryRevisionId,
  OutboxMessageId,
  ResourceId,
  SessionId,
  UserId,
  Uuid,
} from './ids.js';
import type { ProcessingClass } from './processing-class.js';
import type { UserScope } from './scope.js';

export interface UserRecord {
  readonly id: UserId;
  readonly locale: string;
  readonly homeTimeZone: string;
  readonly softActiveGoalLimit: number;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResourceRecord {
  readonly id: ResourceId;
  readonly scope: UserScope;
  readonly resourceType: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export interface EntryRecord {
  readonly id: EntryId;
  readonly resourceId: ResourceId;
  readonly scope: UserScope;
  readonly currentRevisionId: EntryRevisionId | null;
  readonly status: JournalEntryStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly sensitivity: 'normal' | 'sensitive' | 'private';
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly attrsSchemaKey: string;
  readonly attrsSchemaVersion: number;
}

export interface EntryRevisionRecord {
  readonly id: EntryRevisionId;
  readonly scope: UserScope;
  readonly entryId: EntryId;
  readonly revisionNumber: number;
  readonly bodyMarkdown: string;
  readonly bodyRaw: string | null;
  readonly occurredAt: Date;
  readonly processingClass: ProcessingClass;
  readonly changeKind: 'content' | 'privacy' | 'redaction' | 'metadata';
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly createdBy: 'user' | 'system';
}

export interface DerivationLinkRecord {
  readonly id: DerivationLinkId;
  readonly scope: UserScope;
  readonly derivedResourceId: ResourceId;
  readonly sourceResourceId: ResourceId | null;
  readonly sourceRevisionId: EntryRevisionId | null;
  readonly sourceSpanStart: number | null;
  readonly sourceSpanEnd: number | null;
  readonly relation:
    | 'supports'
    | 'contradicts'
    | 'supersedes'
    | 'derived_from'
    | 'measures'
    | 'summarises';
  readonly assertionClass: string;
  readonly confidence: number | null;
  readonly createdAt: Date;
  readonly invalidatedAt: Date | null;
  readonly invalidationReason: string | null;
}

export interface OutboxMessageRecord {
  readonly id: OutboxMessageId;
  readonly event: DomainEventEnvelopeV1;
  readonly topic: string;
  readonly status:
    'pending' | 'in_flight' | 'succeeded' | 'failed' | 'uncertain';
  readonly attempts: number;
  readonly availableAt: Date;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
}

export interface UserRepository {
  findById(id: UserId): Promise<UserRecord | null>;
  save(user: UserRecord): Promise<void>;
}

export interface ResourceRepository {
  findById(scope: UserScope, id: ResourceId): Promise<ResourceRecord | null>;
  save(resource: ResourceRecord): Promise<void>;
}

export interface EntryRepository {
  findById(scope: UserScope, id: EntryId): Promise<EntryRecord | null>;
  list(scope: UserScope): Promise<readonly EntryRecord[]>;
  save(entry: EntryRecord): Promise<void>;
  update(entry: EntryRecord, expectedVersion: number): Promise<boolean>;
}

export interface EntryRevisionRepository {
  findById(
    scope: UserScope,
    id: EntryRevisionId,
  ): Promise<EntryRevisionRecord | null>;
  append(revision: EntryRevisionRecord): Promise<void>;
  listForEntry(
    scope: UserScope,
    entryId: EntryId,
  ): Promise<readonly EntryRevisionRecord[]>;
  findCurrentForAiProcessing(
    scope: UserScope,
    limit: number,
  ): Promise<readonly EntryRevisionRecord[]>;
}

export interface DomainEventRepository {
  append(event: DomainEventEnvelopeV1): Promise<void>;
  acquireCommandLock(
    scope: UserScope,
    correlationId: Uuid,
    eventType: string,
  ): Promise<void>;
  findByCorrelation(
    scope: UserScope,
    correlationId: Uuid,
    eventType: string,
  ): Promise<DomainEventEnvelopeV1 | null>;
  listByTypePrefix(
    scope: UserScope,
    eventTypePrefix: string,
    limit: number,
  ): Promise<readonly DomainEventEnvelopeV1[]>;
}

export interface OutboxRepository {
  append(message: OutboxMessageRecord): Promise<void>;
  findById(
    scope: UserScope,
    id: OutboxMessageId,
  ): Promise<OutboxMessageRecord | null>;
}

export interface DerivationLinkRepository {
  append(link: DerivationLinkRecord): Promise<void>;
  findForDerivedResource(
    scope: UserScope,
    id: ResourceId,
  ): Promise<readonly DerivationLinkRecord[]>;
}

export interface TransactionPorts {
  readonly users: UserRepository;
  readonly resources: ResourceRepository;
  readonly entries: EntryRepository;
  readonly entryRevisions: EntryRevisionRepository;
  readonly domainEvents: DomainEventRepository;
  readonly outbox: OutboxRepository;
  readonly derivationLinks: DerivationLinkRepository;
}

export interface TransactionManager {
  run<T>(
    scope: UserScope,
    operation: (ports: TransactionPorts) => Promise<T>,
  ): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): Uuid;
}

export interface PasswordHasher {
  hash(plainText: string): Promise<string>;
  verify(hash: string, plainText: string): Promise<boolean>;
}

export interface SecretService {
  generate(byteLength: number): string;
  generateRecoveryCode(): RecoveryCode;
  hash(secret: string): string;
  matches(hash: string, secret: string): boolean;
}

export interface AuthCredentialRecord {
  readonly id: Uuid;
  readonly userId: UserId;
  readonly identifier: AuthIdentifier;
  readonly passwordHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly passwordChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecoveryCodeRecord {
  readonly id: Uuid;
  readonly userId: UserId;
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly usedAt: Date | null;
}

export interface AuthSessionRecord {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface AuthEventRecord {
  readonly id: Uuid;
  readonly userId: UserId | null;
  readonly eventType: AuthEventType;
  readonly outcome: AuthEventOutcome;
  readonly reasonCode: AuthFailureReason | null;
  readonly requestId: Uuid;
  readonly clientFingerprintHash: string;
  readonly occurredAt: Date;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAt: Date | null;
}

export interface OwnerBootstrapRepository {
  exists(): Promise<boolean>;
  create(
    user: UserRecord,
    credential: AuthCredentialRecord,
    recoveryCodes: readonly RecoveryCodeRecord[],
  ): Promise<void>;
}

export interface AuthCredentialRepository {
  findByIdentifier(
    identifier: AuthIdentifier,
  ): Promise<AuthCredentialRecord | null>;
  findByUserId(userId: UserId): Promise<AuthCredentialRecord | null>;
  save(record: AuthCredentialRecord): Promise<void>;
}

export interface RecoveryCodeRepository {
  findActiveByUserId(userId: UserId): Promise<readonly RecoveryCodeRecord[]>;
  consume(id: Uuid, usedAt: Date): Promise<boolean>;
}

export interface AuthSessionRepository {
  findByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  save(record: AuthSessionRecord): Promise<void>;
  revoke(id: SessionId, revokedAt: Date): Promise<void>;
  revokeForUser(
    userId: UserId,
    revokedAt: Date,
    exceptSessionId?: SessionId,
  ): Promise<void>;
  countActiveForUser(userId: UserId, at: Date): Promise<number>;
}

export interface AuthRateLimitRepository {
  consume(
    keyHash: string,
    at: Date,
    windowMilliseconds: number,
    maximumAttempts: number,
    blockMilliseconds: number,
  ): Promise<RateLimitDecision>;
}

export interface AuthEventRepository {
  append(record: AuthEventRecord): Promise<void>;
}

export interface AuthenticationTransactionPorts {
  readonly bootstrap: OwnerBootstrapRepository;
  readonly credentials: AuthCredentialRepository;
  readonly recoveryCodes: RecoveryCodeRepository;
  readonly sessions: AuthSessionRepository;
  readonly rateLimits: AuthRateLimitRepository;
  readonly events: AuthEventRepository;
}

export interface AuthenticationTransactionManager {
  run<T>(
    operation: (ports: AuthenticationTransactionPorts) => Promise<T>,
  ): Promise<T>;
}

export interface EventPublisher {
  publish(event: DomainEventEnvelopeV1): Promise<void>;
}
