import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  locale: text('locale').notNull().default('en-ZA'),
  homeTimeZone: text('home_time_zone').notNull(),
  softActiveGoalLimit: integer('soft_active_goal_limit').notNull().default(5),
  settings: jsonb('settings').notNull().default({}),
  ...timestamps,
});

export const authCredentials = pgTable(
  'auth_credentials',
  {
    id: uuid('id').primaryKey(),
    singleton: boolean('singleton').notNull().default(true),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    identifier: text('identifier').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique('auth_credentials_singleton_unique').on(table.singleton),
    check('auth_credentials_singleton_true', sql`${table.singleton} = true`),
    check(
      'auth_credentials_identifier_normalized',
      sql`${table.identifier} = lower(${table.identifier})`,
    ),
    check(
      'auth_credentials_argon2id_hash',
      sql`${table.passwordHash} like '$argon2id$%'`,
    ),
    check(
      'auth_credentials_failures_nonnegative',
      sql`${table.failedAttempts} >= 0`,
    ),
  ],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    check('recovery_codes_hash_length', sql`length(${table.codeHash}) = 64`),
    index('recovery_codes_user_active_idx').on(table.userId, table.usedAt),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp('idle_expires_at', {
      withTimezone: true,
    }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'auth_sessions_token_hash_length',
      sql`length(${table.tokenHash}) = 64`,
    ),
    check(
      'auth_sessions_csrf_hash_length',
      sql`length(${table.csrfTokenHash}) = 64`,
    ),
    check(
      'auth_sessions_expiry_order',
      sql`${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`,
    ),
    index('auth_sessions_user_active_idx').on(
      table.userId,
      table.revokedAt,
      table.idleExpiresAt,
    ),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limits',
  {
    keyHash: text('key_hash').primaryKey(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
    }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'auth_rate_limits_key_hash_length',
      sql`length(${table.keyHash}) = 64`,
    ),
    check('auth_rate_limits_attempts_nonnegative', sql`${table.attempts} >= 0`),
    index('auth_rate_limits_updated_idx').on(table.updatedAt),
  ],
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').notNull(),
    outcome: text('outcome').notNull(),
    reasonCode: text('reason_code'),
    requestId: uuid('request_id').notNull(),
    clientFingerprintHash: text('client_fingerprint_hash').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'auth_events_type_valid',
      sql`${table.eventType} in ('owner_bootstrapped', 'login_succeeded', 'login_failed', 'logout', 'session_renewed', 'password_changed', 'recovery_code_used', 'sessions_revoked')`,
    ),
    check(
      'auth_events_outcome_valid',
      sql`${table.outcome} in ('succeeded', 'rejected')`,
    ),
    check(
      'auth_events_reason_valid',
      sql`${table.reasonCode} is null or ${table.reasonCode} in ('credentials_invalid', 'credential_locked', 'rate_limited', 'session_invalid', 'csrf_invalid', 'recovery_code_invalid')`,
    ),
    check(
      'auth_events_fingerprint_hash_length',
      sql`length(${table.clientFingerprintHash}) = 64`,
    ),
    index('auth_events_user_occurred_idx').on(table.userId, table.occurredAt),
    index('auth_events_request_idx').on(table.requestId),
  ],
);

export const schemaRegistry = pgTable(
  'schema_registry',
  {
    key: text('key').notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull().default('active'),
    jsonSchema: jsonb('json_schema').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.key, table.version] }),
    check('schema_registry_version_positive', sql`${table.version} > 0`),
    check(
      'schema_registry_schema_object',
      sql`jsonb_typeof(${table.jsonSchema}) = 'object'`,
    ),
  ],
);

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull(),
    resourceTypeVersion: integer('resource_type_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('resources_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.resourceType, table.resourceTypeVersion],
      foreignColumns: [schemaRegistry.key, schemaRegistry.version],
      name: 'resources_registered_type_fk',
    }),
    index('resources_user_type_idx').on(table.userId, table.resourceType),
    index('resources_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentRevisionId: uuid('current_revision_id'),
    status: text('status').notNull().default('active'),
    ...timestamps,
    version: integer('version').notNull().default(1),
    sensitivity: text('sensitivity').notNull().default('normal'),
    attrs: jsonb('attrs').notNull().default({}),
    attrsSchemaKey: text('attrs_schema_key').notNull().default('attrs.entry'),
    attrsSchemaVersion: integer('attrs_schema_version').notNull().default(1),
  },
  (table) => [
    unique('entries_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'entries_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.attrsSchemaKey, table.attrsSchemaVersion],
      foreignColumns: [schemaRegistry.key, schemaRegistry.version],
      name: 'entries_attrs_schema_fk',
    }),
    check('entries_version_positive', sql`${table.version} > 0`),
    check('entries_attrs_object', sql`jsonb_typeof(${table.attrs}) = 'object'`),
    check(
      'entries_status_valid',
      sql`${table.status} in ('active', 'archived', 'deletion_requested')`,
    ),
    check(
      'entries_sensitivity_valid',
      sql`${table.sensitivity} in ('normal', 'sensitive', 'private')`,
    ),
    index('entries_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

export const entryRevisions = pgTable(
  'entry_revisions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    bodyRaw: text('body_raw'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    processingClass: text('processing_class').notNull(),
    changeKind: text('change_kind').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    unique('entry_revisions_id_user_unique').on(table.id, table.userId),
    uniqueIndex('entry_revisions_entry_number_unique').on(
      table.entryId,
      table.revisionNumber,
    ),
    foreignKey({
      columns: [table.entryId, table.userId],
      foreignColumns: [entries.id, entries.userId],
      name: 'entry_revisions_entry_owner_fk',
    }).onDelete('cascade'),
    check('entry_revisions_number_positive', sql`${table.revisionNumber} > 0`),
    check(
      'entry_revisions_processing_class_valid',
      sql`${table.processingClass} in ('standard', 'sensitive', 'private')`,
    ),
    check(
      'entry_revisions_change_kind_valid',
      sql`${table.changeKind} in ('content', 'privacy', 'redaction', 'metadata')`,
    ),
    check(
      'entry_revisions_created_by_valid',
      sql`${table.createdBy} in ('user', 'system')`,
    ),
    check(
      'entry_revisions_content_hash_length',
      sql`length(${table.contentHash}) = 64`,
    ),
    index('entry_revisions_user_created_idx').on(table.userId, table.createdAt),
    index('entry_revisions_ai_processing_idx').on(
      table.userId,
      table.processingClass,
      table.createdAt,
    ),
  ],
);

export const derivationLinks = pgTable(
  'derivation_links',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    derivedResourceId: uuid('derived_resource_id').notNull(),
    sourceResourceId: uuid('source_resource_id'),
    sourceRevisionId: uuid('source_revision_id'),
    sourceSpanStart: integer('source_span_start'),
    sourceSpanEnd: integer('source_span_end'),
    relation: text('relation').notNull(),
    assertionClass: text('assertion_class').notNull(),
    confidence: numeric('confidence', { precision: 6, scale: 5 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    invalidationReason: text('invalidation_reason'),
  },
  (table) => [
    foreignKey({
      columns: [table.derivedResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'derivation_links_derived_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'derivation_links_source_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceRevisionId, table.userId],
      foreignColumns: [entryRevisions.id, entryRevisions.userId],
      name: 'derivation_links_source_revision_owner_fk',
    }).onDelete('cascade'),
    check(
      'derivation_links_has_source',
      sql`${table.sourceResourceId} is not null or ${table.sourceRevisionId} is not null`,
    ),
    check(
      'derivation_links_span_valid',
      sql`(${table.sourceSpanStart} is null and ${table.sourceSpanEnd} is null) or (${table.sourceSpanStart} >= 0 and ${table.sourceSpanEnd} > ${table.sourceSpanStart})`,
    ),
    check(
      'derivation_links_relation_valid',
      sql`${table.relation} in ('supports', 'contradicts', 'supersedes', 'derived_from', 'measures', 'summarises')`,
    ),
    check(
      'derivation_links_confidence_valid',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    index('derivation_links_derived_idx').on(
      table.userId,
      table.derivedResourceId,
    ),
    index('derivation_links_source_revision_idx').on(
      table.userId,
      table.sourceRevisionId,
    ),
  ],
);

export const domainEvents = pgTable(
  'domain_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payloadSchemaVersion: integer('payload_schema_version').notNull(),
    payload: jsonb('payload').notNull(),
    aggregateId: uuid('aggregate_id'),
    correlationId: uuid('correlation_id').notNull(),
    causationId: uuid('causation_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('domain_events_id_user_unique').on(table.id, table.userId),
    index('domain_events_user_occurred_idx').on(table.userId, table.occurredAt),
    index('domain_events_correlation_idx').on(
      table.userId,
      table.correlationId,
    ),
    uniqueIndex('domain_events_command_idempotency_unique').on(
      table.userId,
      table.eventType,
      table.correlationId,
    ),
  ],
);

export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domainEventId: uuid('domain_event_id').notNull(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.domainEventId, table.userId],
      foreignColumns: [domainEvents.id, domainEvents.userId],
      name: 'outbox_messages_event_owner_fk',
    }).onDelete('cascade'),
    uniqueIndex('outbox_messages_event_unique').on(table.domainEventId),
    check('outbox_messages_attempts_nonnegative', sql`${table.attempts} >= 0`),
    check(
      'outbox_messages_status_valid',
      sql`${table.status} in ('pending', 'in_flight', 'succeeded', 'failed', 'uncertain')`,
    ),
    index('outbox_messages_claim_idx').on(table.status, table.availableAt),
    index('outbox_messages_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const schemaTables = {
  authCredentials,
  authEvents,
  authRateLimits,
  authSessions,
  derivationLinks,
  domainEvents,
  entries,
  entryRevisions,
  outboxMessages,
  resources,
  recoveryCodes,
  schemaRegistry,
  users,
} as const;
