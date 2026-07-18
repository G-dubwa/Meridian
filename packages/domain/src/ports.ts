import type { DomainEventEnvelopeV1 } from './events.js';
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
  readonly status: 'active' | 'deleted';
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
  save(entry: EntryRecord): Promise<void>;
}

export interface EntryRevisionRepository {
  findById(
    scope: UserScope,
    id: EntryRevisionId,
  ): Promise<EntryRevisionRecord | null>;
  append(revision: EntryRevisionRecord): Promise<void>;
}

export interface DomainEventRepository {
  append(event: DomainEventEnvelopeV1): Promise<void>;
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

export interface SessionRecord {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface SessionStore {
  findById(id: SessionId): Promise<SessionRecord | null>;
  save(session: SessionRecord): Promise<void>;
  revoke(id: SessionId): Promise<void>;
}

export interface EventPublisher {
  publish(event: DomainEventEnvelopeV1): Promise<void>;
}
