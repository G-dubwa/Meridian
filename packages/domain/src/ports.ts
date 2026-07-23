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
  ConsentAction,
  IntegrationAccountStatus,
  MicrosoftDelegatedScope,
  MicrosoftProfile,
} from './integration.js';
import type {
  AgendaBlockId,
  DailyPriorityId,
  DerivationLinkId,
  CommandReceiptId,
  EntryId,
  EntryRevisionId,
  OutboxMessageId,
  ProposalId,
  ReminderId,
  ReminderOccurrenceId,
  ResourceId,
  SessionId,
  TaskId,
  TodayReceiptId,
  UserId,
  Uuid,
} from './ids.js';
import type {
  AgendaBlockState,
  LocalDateV1,
  TodayLifecycleAction,
  TodayTargetType,
} from './today.js';
import type {
  CommandReceiptStatus,
  CreationAuthority,
  RecurrenceRuleV1,
  ReminderOccurrenceState,
  ReminderPriority,
  ReminderState,
  TaskKind,
  TaskState,
} from './action.js';
import type { ProcessingClass } from './processing-class.js';
import type {
  AssertionClass,
  ProposalAuthorityClass,
  ProposalPayloadV1,
  ProposalStatus,
  ProposalType,
} from './proposal.js';
import type { UserScope } from './scope.js';
import type {
  OutboxHealthSnapshot,
  OutboxJobV1,
  WorkerErrorCode,
  WorkerObservationV1,
} from './worker.js';
import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelInvocationObservationV1,
} from './model.js';

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

export interface ProposalRecord {
  readonly id: ProposalId;
  readonly resourceId: ResourceId;
  readonly scope: UserScope;
  readonly sourceRevisionId: EntryRevisionId;
  readonly sourceSpanStart: number;
  readonly sourceSpanEnd: number;
  readonly proposalType: ProposalType;
  readonly payload: ProposalPayloadV1;
  readonly authorityClass: ProposalAuthorityClass;
  readonly assertionClass: AssertionClass;
  readonly confidence: number;
  readonly uncertaintyIndicators: readonly string[];
  readonly dedupeKey: string;
  readonly status: ProposalStatus;
  readonly expiresAt: Date;
  readonly suppressionUntil: Date | null;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly version: number;
}

export interface TaskRecord {
  readonly id: TaskId;
  readonly resourceId: ResourceId;
  readonly scope: UserScope;
  readonly goalResourceId: ResourceId | null;
  readonly kind: TaskKind;
  readonly title: string;
  readonly notes: string;
  readonly estimateMinutes: number | null;
  readonly dueAt: Date | null;
  readonly state: TaskState;
  readonly creationAuthority: CreationAuthority;
  readonly sourceProposalId: ProposalId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ReminderRecord {
  readonly id: ReminderId;
  readonly resourceId: ResourceId;
  readonly scope: UserScope;
  readonly relatedResourceId: ResourceId | null;
  readonly purpose: string;
  readonly triggerAt: Date;
  readonly timeZone: string;
  readonly recurrence: RecurrenceRuleV1 | null;
  readonly deliveryPolicy: 'undecided';
  readonly priority: ReminderPriority;
  readonly quietHoursBehavior: 'defer';
  readonly expiresAt: Date | null;
  readonly state: ReminderState;
  readonly creationAuthority: CreationAuthority;
  readonly sourceProposalId: ProposalId | null;
  readonly ownerFeedback: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ReminderOccurrenceRecord {
  readonly id: ReminderOccurrenceId;
  readonly scope: UserScope;
  readonly reminderId: ReminderId;
  readonly scheduledFor: Date;
  readonly state: ReminderOccurrenceState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommandReceiptRecord {
  readonly id: CommandReceiptId;
  readonly scope: UserScope;
  readonly targetResourceId: ResourceId;
  readonly targetType: 'task' | 'reminder';
  readonly status: CommandReceiptStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly undoneAt: Date | null;
  readonly version: number;
}

export interface AgendaBlockRecord {
  readonly id: AgendaBlockId;
  readonly resourceId: ResourceId;
  readonly scope: UserScope;
  readonly title: string;
  readonly notes: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly state: AgendaBlockState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DailyPriorityRecord {
  readonly id: DailyPriorityId;
  readonly scope: UserScope;
  readonly taskId: TaskId;
  readonly localDate: LocalDateV1;
  readonly position: 1 | 2 | 3;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface TodayReceiptRecord {
  readonly id: TodayReceiptId;
  readonly scope: UserScope;
  readonly targetResourceId: ResourceId;
  readonly targetType: TodayTargetType;
  readonly action: TodayLifecycleAction;
  readonly priorState: string | null;
  readonly resultingVersion: number;
  readonly effectId: DailyPriorityId | null;
  readonly status: 'active' | 'undone';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly undoneAt: Date | null;
  readonly version: number;
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
  readonly lastErrorCode: WorkerErrorCode | null;
  readonly lastErrorAt: Date | null;
  readonly deadLetteredAt: Date | null;
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
  health(
    scope: UserScope,
    deadLetterLimit: number,
  ): Promise<OutboxHealthSnapshot>;
}

export interface OutboxDispatchGateway {
  dispatchAvailable(
    scope: UserScope,
    now: Date,
    limit: number,
  ): Promise<readonly OutboxJobV1[]>;
}

export type OutboxAttemptClaim =
  | { readonly state: 'claimed'; readonly message: OutboxMessageRecord }
  | { readonly state: 'duplicate' }
  | { readonly state: 'succeeded' }
  | { readonly state: 'dead_lettered' }
  | { readonly state: 'missing' };

export interface WorkerOutboxRepository {
  claimAttempt(
    job: OutboxJobV1,
    attempt: number,
    startedAt: Date,
  ): Promise<OutboxAttemptClaim>;
  markSucceeded(
    job: OutboxJobV1,
    attempt: number,
    processedAt: Date,
  ): Promise<boolean>;
  markFailed(
    job: OutboxJobV1,
    attempt: number,
    errorCode: WorkerErrorCode,
    failedAt: Date,
    terminal: boolean,
  ): Promise<boolean>;
}

export interface WorkerObservationSink {
  observe(observation: WorkerObservationV1): void;
}

export interface DerivationLinkRepository {
  append(link: DerivationLinkRecord): Promise<void>;
  findForDerivedResource(
    scope: UserScope,
    id: ResourceId,
  ): Promise<readonly DerivationLinkRecord[]>;
}

export interface ProposalRepository {
  acquireDedupeLock(scope: UserScope, dedupeKey: string): Promise<void>;
  findById(scope: UserScope, id: ProposalId): Promise<ProposalRecord | null>;
  findByDedupeKey(
    scope: UserScope,
    dedupeKey: string,
  ): Promise<ProposalRecord | null>;
  listPending(scope: UserScope, at: Date): Promise<readonly ProposalRecord[]>;
  save(proposal: ProposalRecord): Promise<void>;
  stalePendingForRevision(
    scope: UserScope,
    revisionId: EntryRevisionId,
    decidedAt: Date,
  ): Promise<readonly ProposalRecord[]>;
  update(proposal: ProposalRecord, expectedVersion: number): Promise<boolean>;
}

export interface TaskRepository {
  findById(scope: UserScope, id: TaskId): Promise<TaskRecord | null>;
  list(scope: UserScope): Promise<readonly TaskRecord[]>;
  save(task: TaskRecord): Promise<void>;
  update(task: TaskRecord, expectedVersion: number): Promise<boolean>;
}

export interface ReminderRepository {
  findById(scope: UserScope, id: ReminderId): Promise<ReminderRecord | null>;
  list(scope: UserScope): Promise<readonly ReminderRecord[]>;
  save(reminder: ReminderRecord): Promise<void>;
  update(reminder: ReminderRecord, expectedVersion: number): Promise<boolean>;
}

export interface ReminderOccurrenceRepository {
  save(occurrence: ReminderOccurrenceRecord): Promise<void>;
  cancelPending(
    scope: UserScope,
    reminderId: ReminderId,
    at: Date,
  ): Promise<void>;
  restoreSettled(
    scope: UserScope,
    reminderId: ReminderId,
    state: 'acknowledged' | 'dismissed',
    at: Date,
  ): Promise<void>;
  settle(
    scope: UserScope,
    reminderId: ReminderId,
    state: 'acknowledged' | 'dismissed',
    at: Date,
  ): Promise<void>;
}

export interface CommandReceiptRepository {
  findById(
    scope: UserScope,
    id: CommandReceiptId,
  ): Promise<CommandReceiptRecord | null>;
  findActiveForTarget(
    scope: UserScope,
    targetResourceId: ResourceId,
  ): Promise<CommandReceiptRecord | null>;
  save(receipt: CommandReceiptRecord): Promise<void>;
  update(
    receipt: CommandReceiptRecord,
    expectedVersion: number,
  ): Promise<boolean>;
}

export interface AgendaBlockRepository {
  findById(
    scope: UserScope,
    id: AgendaBlockId,
  ): Promise<AgendaBlockRecord | null>;
  listBetween(
    scope: UserScope,
    start: Date,
    end: Date,
  ): Promise<readonly AgendaBlockRecord[]>;
  save(record: AgendaBlockRecord): Promise<void>;
  update(record: AgendaBlockRecord, expectedVersion: number): Promise<boolean>;
}

export interface DailyPriorityRepository {
  acquireDateLock(scope: UserScope, localDate: LocalDateV1): Promise<void>;
  findById(
    scope: UserScope,
    id: DailyPriorityId,
  ): Promise<DailyPriorityRecord | null>;
  listForDate(
    scope: UserScope,
    localDate: LocalDateV1,
  ): Promise<readonly DailyPriorityRecord[]>;
  save(record: DailyPriorityRecord): Promise<void>;
  delete(scope: UserScope, id: DailyPriorityId): Promise<boolean>;
}

export interface TodayReceiptRepository {
  findById(
    scope: UserScope,
    id: TodayReceiptId,
  ): Promise<TodayReceiptRecord | null>;
  save(record: TodayReceiptRecord): Promise<void>;
  update(record: TodayReceiptRecord, expectedVersion: number): Promise<boolean>;
}

export interface TransactionPorts {
  readonly agendaBlocks: AgendaBlockRepository;
  readonly commandReceipts: CommandReceiptRepository;
  readonly consentRecords: ConsentRecordRepository;
  readonly dailyPriorities: DailyPriorityRepository;
  readonly derivationLinks: DerivationLinkRepository;
  readonly domainEvents: DomainEventRepository;
  readonly entries: EntryRepository;
  readonly entryRevisions: EntryRevisionRepository;
  readonly integrationAccounts: IntegrationAccountRepository;
  readonly outbox: OutboxRepository;
  readonly proposals: ProposalRepository;
  readonly reminderOccurrences: ReminderOccurrenceRepository;
  readonly reminders: ReminderRepository;
  readonly resources: ResourceRepository;
  readonly tasks: TaskRepository;
  readonly todayReceipts: TodayReceiptRepository;
  readonly users: UserRepository;
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

export interface CalendarProjection {
  readonly externalId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly label: string;
  readonly source: string;
}

export interface CalendarPort {
  list(
    scope: UserScope,
    start: Date,
    end: Date,
  ): Promise<readonly CalendarProjection[]>;
}

export interface ReminderDeliveryRequest {
  readonly occurrenceId: ReminderOccurrenceId;
  readonly reminderId: ReminderId;
  readonly scheduledFor: Date;
}

export interface ReminderDeliveryResult {
  readonly state: 'delivered' | 'rejected' | 'uncertain';
  readonly providerReference: string | null;
}

export interface ReminderDeliveryPort {
  deliver(
    scope: UserScope,
    request: ReminderDeliveryRequest,
  ): Promise<ReminderDeliveryResult>;
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

export interface ModelInferencePort {
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
}

export interface ModelObservationSink {
  observe(observation: ModelInvocationObservationV1): void;
}

export interface IntegrationAccountRecord {
  readonly id: Uuid;
  readonly scope: UserScope;
  readonly provider: 'microsoft';
  readonly providerSubjectId: string;
  readonly displayName: string;
  readonly status: IntegrationAccountStatus;
  readonly grantedScopes: readonly MicrosoftDelegatedScope[];
  readonly accessTokenCiphertext: string | null;
  readonly refreshTokenCiphertext: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly tokenKeyVersion: number;
  readonly connectedAt: Date;
  readonly disconnectedAt: Date | null;
  readonly lastRefreshedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ConsentRecord {
  readonly id: Uuid;
  readonly scope: UserScope;
  readonly integrationAccountId: Uuid;
  readonly provider: 'microsoft';
  readonly action: ConsentAction;
  readonly scopes: readonly MicrosoftDelegatedScope[];
  readonly occurredAt: Date;
}

export interface OAuthAuthorizationSessionRecord {
  readonly id: Uuid;
  readonly userId: UserId;
  readonly provider: 'microsoft';
  readonly stateHash: string;
  readonly codeVerifierCiphertext: string;
  readonly redirectUri: string;
  readonly requestedScopes: readonly MicrosoftDelegatedScope[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface IntegrationAccountRepository {
  findMicrosoft(scope: UserScope): Promise<IntegrationAccountRecord | null>;
  save(record: IntegrationAccountRecord): Promise<void>;
}

export interface ConsentRecordRepository {
  append(record: ConsentRecord): Promise<void>;
  list(scope: UserScope): Promise<readonly ConsentRecord[]>;
}

export interface OAuthAuthorizationSessionStore {
  create(record: OAuthAuthorizationSessionRecord): Promise<void>;
  consume(
    stateHash: string,
    consumedAt: Date,
  ): Promise<OAuthAuthorizationSessionRecord | null>;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export interface PkceGenerator {
  generate(): PkcePair;
}

export interface TokenCipher {
  seal(plainText: string, context: string): string;
  open(ciphertext: string, context: string): string;
}

export interface MicrosoftAuthorizationRequest {
  readonly state: string;
  readonly codeChallenge: string;
  readonly scopes: readonly MicrosoftDelegatedScope[];
  readonly redirectUri: string;
}

export interface MicrosoftTokenGrant {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly grantedScopes: readonly MicrosoftDelegatedScope[];
}

export interface MicrosoftOAuthGateway {
  authorizationUrl(request: MicrosoftAuthorizationRequest): URL;
  exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<MicrosoftTokenGrant>;
  refresh(refreshToken: string): Promise<MicrosoftTokenGrant>;
  readProfile(accessToken: string): Promise<MicrosoftProfile>;
}
