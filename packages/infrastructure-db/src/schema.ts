import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
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

const unconstrainedVector = customType<{
  data: number[];
  driverData: string;
}>({
  dataType: () => 'vector',
  fromDriver: (value) =>
    value
      .slice(1, -1)
      .split(',')
      .filter((item) => item.length > 0)
      .map(Number),
  toDriver: (value) => `[${value.join(',')}]`,
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    locale: text('locale').notNull().default('en-ZA'),
    homeTimeZone: text('home_time_zone').notNull(),
    softActiveGoalLimit: integer('soft_active_goal_limit').notNull().default(5),
    settings: jsonb('settings').notNull().default({}),
    ...timestamps,
  },
  (table) => [
    check(
      'users_soft_active_goal_limit_valid',
      sql`${table.softActiveGoalLimit} between 1 and 20`,
    ),
  ],
);

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

export const oauthAuthorizationSessions = pgTable(
  'oauth_authorization_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    stateHash: text('state_hash').notNull().unique(),
    codeVerifierCiphertext: text('code_verifier_ciphertext').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    requestedScopes: text('requested_scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'oauth_authorization_sessions_provider',
      sql`${table.provider} = 'microsoft'`,
    ),
    check(
      'oauth_authorization_sessions_state_hash',
      sql`length(${table.stateHash}) = 64`,
    ),
    check(
      'oauth_authorization_sessions_ciphertext',
      sql`${table.codeVerifierCiphertext} like 'v1.%'`,
    ),
    check(
      'oauth_authorization_sessions_expiry',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'oauth_authorization_sessions_consumed',
      sql`${table.consumedAt} is null or ${table.consumedAt} >= ${table.createdAt}`,
    ),
    check(
      'oauth_authorization_sessions_stage_a_scopes',
      sql`cardinality(${table.requestedScopes}) = 5 and ${table.requestedScopes} @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and ${table.requestedScopes} <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[]`,
    ),
    index('oauth_authorization_sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const integrationAccounts = pgTable(
  'integration_accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubjectId: text('provider_subject_id').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull(),
    grantedScopes: text('granted_scopes').array().notNull(),
    accessTokenCiphertext: text('access_token_ciphertext'),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    tokenKeyVersion: integer('token_key_version').notNull().default(1),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull(),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('integration_accounts_user_provider_unique').on(
      table.userId,
      table.provider,
    ),
    unique('integration_accounts_id_user_unique').on(table.id, table.userId),
    check(
      'integration_accounts_provider',
      sql`${table.provider} = 'microsoft'`,
    ),
    check(
      'integration_accounts_status',
      sql`${table.status} in ('connected', 'disconnected', 'reauthorization_required')`,
    ),
    check(
      'integration_accounts_key_version',
      sql`${table.tokenKeyVersion} = 1`,
    ),
    check(
      'integration_accounts_token_state',
      sql`(${table.status} = 'connected' and ${table.accessTokenCiphertext} is not null and ${table.refreshTokenCiphertext} is not null and ${table.tokenExpiresAt} is not null and ${table.disconnectedAt} is null) or (${table.status} <> 'connected' and ${table.accessTokenCiphertext} is null and ${table.refreshTokenCiphertext} is null and ${table.tokenExpiresAt} is null)`,
    ),
    check(
      'integration_accounts_ciphertext',
      sql`(${table.accessTokenCiphertext} is null or ${table.accessTokenCiphertext} like 'v1.%') and (${table.refreshTokenCiphertext} is null or ${table.refreshTokenCiphertext} like 'v1.%')`,
    ),
    check(
      'integration_accounts_stage_a_scopes',
      sql`cardinality(${table.grantedScopes}) = 5 and ${table.grantedScopes} @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and ${table.grantedScopes} <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[]`,
    ),
    index('integration_accounts_user_status_idx').on(
      table.userId,
      table.status,
    ),
  ],
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    integrationAccountId: uuid('integration_account_id').notNull(),
    provider: text('provider').notNull(),
    action: text('action').notNull(),
    scopes: text('scopes').array().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.integrationAccountId, table.userId],
      foreignColumns: [integrationAccounts.id, integrationAccounts.userId],
      name: 'consent_records_account_owner_fk',
    }).onDelete('cascade'),
    check('consent_records_provider', sql`${table.provider} = 'microsoft'`),
    check(
      'consent_records_action',
      sql`${table.action} in ('granted', 'disconnected', 'reauthorization_required')`,
    ),
    check(
      'consent_records_stage_a_scopes',
      sql`cardinality(${table.scopes}) = 5 and ${table.scopes} @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and ${table.scopes} <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[]`,
    ),
    index('consent_records_user_occurred_idx').on(
      table.userId,
      table.occurredAt,
    ),
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

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').notNull(),
    sourceSpanStart: integer('source_span_start').notNull(),
    sourceSpanEnd: integer('source_span_end').notNull(),
    proposalType: text('proposal_type').notNull(),
    payload: jsonb('payload').notNull(),
    authorityClass: text('authority_class').notNull(),
    assertionClass: text('assertion_class').notNull(),
    confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull(),
    uncertaintyIndicators: jsonb('uncertainty_indicators')
      .notNull()
      .default([]),
    dedupeKey: text('dedupe_key').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    suppressionUntil: timestamp('suppression_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('proposals_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'proposals_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceRevisionId, table.userId],
      foreignColumns: [entryRevisions.id, entryRevisions.userId],
      name: 'proposals_source_revision_owner_fk',
    }).onDelete('cascade'),
    check(
      'proposals_type_valid',
      sql`${table.proposalType} in ('task', 'reminder', 'commitment', 'goal', 'memory')`,
    ),
    check(
      'proposals_authority_valid',
      sql`${table.authorityClass} in ('ambiguous_command', 'inferred_structure', 'durable_claim', 'external_action_preview')`,
    ),
    check(
      'proposals_assertion_valid',
      sql`${table.assertionClass} in ('explicit_statement', 'strong_interpretation', 'weak_inference', 'hypothesis')`,
    ),
    check(
      'proposals_status_valid',
      sql`${table.status} in ('pending', 'accepted', 'edited_accepted', 'dismissed', 'stale', 'expired')`,
    ),
    check(
      'proposals_span_valid',
      sql`${table.sourceSpanEnd} > ${table.sourceSpanStart}`,
    ),
    check(
      'proposals_span_start_nonnegative',
      sql`${table.sourceSpanStart} >= 0`,
    ),
    check(
      'proposals_confidence_valid',
      sql`${table.confidence} between 0 and 1`,
    ),
    check('proposals_dedupe_length', sql`length(${table.dedupeKey}) = 64`),
    check('proposals_version_positive', sql`${table.version} > 0`),
    check(
      'proposals_payload_object',
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      'proposals_uncertainty_array',
      sql`jsonb_typeof(${table.uncertaintyIndicators}) = 'array'`,
    ),
    index('proposals_user_pending_idx').on(
      table.userId,
      table.status,
      table.expiresAt,
    ),
    index('proposals_user_dedupe_idx').on(
      table.userId,
      table.dedupeKey,
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

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalResourceId: uuid('goal_resource_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    estimateMinutes: integer('estimate_minutes'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    state: text('state').notNull().default('open'),
    creationAuthority: text('creation_authority').notNull(),
    sourceProposalId: uuid('source_proposal_id'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('tasks_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'tasks_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.goalResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'tasks_goal_owner_fk',
    }),
    foreignKey({
      columns: [table.sourceProposalId, table.userId],
      foreignColumns: [proposals.id, proposals.userId],
      name: 'tasks_proposal_owner_fk',
    }),
    check(
      'tasks_kind_valid',
      sql`${table.kind} in ('task', 'commitment', 'routine', 'milestone')`,
    ),
    check(
      'tasks_state_valid',
      sql`${table.state} in ('open', 'scheduled', 'done', 'dropped', 'superseded')`,
    ),
    check(
      'tasks_creation_authority_valid',
      sql`${table.creationAuthority} in ('manual', 'explicit_command', 'accepted_proposal')`,
    ),
    check(
      'tasks_estimate_valid',
      sql`${table.estimateMinutes} is null or (${table.estimateMinutes} between 1 and 10080)`,
    ),
    check(
      'tasks_title_valid',
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check('tasks_notes_valid', sql`length(${table.notes}) <= 2000`),
    check('tasks_version_positive', sql`${table.version} > 0`),
    index('tasks_user_state_due_idx').on(
      table.userId,
      table.state,
      table.dueAt,
    ),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relatedResourceId: uuid('related_resource_id'),
    purpose: text('purpose').notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true }).notNull(),
    timeZone: text('time_zone').notNull(),
    recurrence: jsonb('recurrence'),
    deliveryPolicy: text('delivery_policy').notNull().default('undecided'),
    priority: text('priority').notNull().default('normal'),
    quietHoursBehavior: text('quiet_hours_behavior').notNull().default('defer'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    state: text('state').notNull().default('scheduled'),
    creationAuthority: text('creation_authority').notNull(),
    sourceProposalId: uuid('source_proposal_id'),
    ownerFeedback: text('owner_feedback'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('reminders_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'reminders_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.relatedResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'reminders_related_owner_fk',
    }),
    foreignKey({
      columns: [table.sourceProposalId, table.userId],
      foreignColumns: [proposals.id, proposals.userId],
      name: 'reminders_proposal_owner_fk',
    }),
    check(
      'reminders_purpose_valid',
      sql`length(btrim(${table.purpose})) between 1 and 500`,
    ),
    check(
      'reminders_time_zone_valid',
      sql`length(${table.timeZone}) between 1 and 100`,
    ),
    check(
      'reminders_recurrence_object',
      sql`${table.recurrence} is null or jsonb_typeof(${table.recurrence}) = 'object'`,
    ),
    check(
      'reminders_delivery_policy_valid',
      sql`${table.deliveryPolicy} = 'undecided'`,
    ),
    check(
      'reminders_priority_valid',
      sql`${table.priority} in ('low', 'normal', 'high')`,
    ),
    check(
      'reminders_quiet_hours_valid',
      sql`${table.quietHoursBehavior} = 'defer'`,
    ),
    check(
      'reminders_expiry_valid',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.triggerAt}`,
    ),
    check(
      'reminders_state_valid',
      sql`${table.state} in ('scheduled', 'due', 'delivered', 'completed', 'dismissed', 'snoozed', 'paused', 'expired')`,
    ),
    check(
      'reminders_creation_authority_valid',
      sql`${table.creationAuthority} in ('manual', 'explicit_command', 'accepted_proposal')`,
    ),
    check(
      'reminders_feedback_valid',
      sql`${table.ownerFeedback} is null or length(${table.ownerFeedback}) <= 1000`,
    ),
    check('reminders_version_positive', sql`${table.version} > 0`),
    index('reminders_user_state_trigger_idx').on(
      table.userId,
      table.state,
      table.triggerAt,
    ),
  ],
);

export const reminderOccurrences = pgTable(
  'reminder_occurrences',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderId: uuid('reminder_id').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    state: text('state').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.reminderId, table.userId],
      foreignColumns: [reminders.id, reminders.userId],
      name: 'reminder_occurrences_reminder_owner_fk',
    }).onDelete('cascade'),
    unique('reminder_occurrences_schedule_unique').on(
      table.reminderId,
      table.scheduledFor,
    ),
    check(
      'reminder_occurrences_state_valid',
      sql`${table.state} in ('pending', 'due', 'acknowledged', 'dismissed', 'cancelled')`,
    ),
    index('reminder_occurrences_user_due_idx').on(
      table.userId,
      table.state,
      table.scheduledFor,
    ),
  ],
);

export const commandReceipts = pgTable(
  'command_receipts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetResourceId: uuid('target_resource_id').notNull(),
    targetType: text('target_type').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    foreignKey({
      columns: [table.targetResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'command_receipts_target_owner_fk',
    }).onDelete('cascade'),
    check(
      'command_receipts_target_valid',
      sql`${table.targetType} in ('task', 'reminder')`,
    ),
    check(
      'command_receipts_status_valid',
      sql`${table.status} in ('active', 'undone')`,
    ),
    check(
      'command_receipts_undone_valid',
      sql`(${table.status} = 'active' and ${table.undoneAt} is null) or (${table.status} = 'undone' and ${table.undoneAt} is not null)`,
    ),
    check('command_receipts_version_positive', sql`${table.version} > 0`),
    index('command_receipts_user_created_idx').on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const agendaBlocks = pgTable(
  'agenda_blocks',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timeZone: text('time_zone').notNull(),
    state: text('state').notNull().default('planned'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('agenda_blocks_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'agenda_blocks_resource_owner_fk',
    }).onDelete('cascade'),
    check(
      'agenda_blocks_title_valid',
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check('agenda_blocks_notes_valid', sql`length(${table.notes}) <= 2000`),
    check(
      'agenda_blocks_time_zone_valid',
      sql`length(${table.timeZone}) between 1 and 100`,
    ),
    check(
      'agenda_blocks_order_valid',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'agenda_blocks_duration_valid',
      sql`${table.endsAt} <= ${table.startsAt} + interval '24 hours'`,
    ),
    check(
      'agenda_blocks_state_valid',
      sql`${table.state} in ('planned', 'completed', 'cancelled')`,
    ),
    check('agenda_blocks_version_positive', sql`${table.version} > 0`),
    index('agenda_blocks_user_window_idx').on(
      table.userId,
      table.startsAt,
      table.endsAt,
    ),
  ],
);

export const dailyPriorities = pgTable(
  'daily_priorities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    position: integer('position').notNull(),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('daily_priorities_id_user_unique').on(table.id, table.userId),
    unique('daily_priorities_task_date_unique').on(
      table.userId,
      table.taskId,
      table.localDate,
    ),
    unique('daily_priorities_position_unique').on(
      table.userId,
      table.localDate,
      table.position,
    ),
    foreignKey({
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
      name: 'daily_priorities_task_owner_fk',
    }).onDelete('cascade'),
    check(
      'daily_priorities_position_valid',
      sql`${table.position} between 1 and 3`,
    ),
    check('daily_priorities_version_positive', sql`${table.version} > 0`),
    index('daily_priorities_user_date_idx').on(
      table.userId,
      table.localDate,
      table.position,
    ),
  ],
);

export const todayReceipts = pgTable(
  'today_receipts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetResourceId: uuid('target_resource_id').notNull(),
    targetType: text('target_type').notNull(),
    action: text('action').notNull(),
    priorState: text('prior_state'),
    resultingVersion: integer('resulting_version').notNull(),
    effectId: uuid('effect_id'),
    status: text('status').notNull().default('active'),
    ...timestamps,
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('today_receipts_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.targetResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'today_receipts_target_owner_fk',
    }).onDelete('cascade'),
    check(
      'today_receipts_target_valid',
      sql`${table.targetType} in ('task', 'reminder', 'agenda_block', 'priority')`,
    ),
    check(
      'today_receipts_action_valid',
      sql`${table.action} in ('task_completed', 'reminder_completed', 'reminder_dismissed', 'agenda_completed', 'agenda_cancelled', 'priority_selected')`,
    ),
    check(
      'today_receipts_status_valid',
      sql`${table.status} in ('active', 'undone')`,
    ),
    check(
      'today_receipts_undone_valid',
      sql`(${table.status} = 'active' and ${table.undoneAt} is null) or (${table.status} = 'undone' and ${table.undoneAt} is not null)`,
    ),
    check(
      'today_receipts_priority_effect_valid',
      sql`(${table.targetType} = 'priority' and ${table.effectId} is not null and ${table.priorState} is null) or (${table.targetType} <> 'priority' and ${table.effectId} is null and ${table.priorState} is not null)`,
    ),
    check(
      'today_receipts_result_version_positive',
      sql`${table.resultingVersion} > 0`,
    ),
    check('today_receipts_version_positive', sql`${table.version} > 0`),
    index('today_receipts_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    narrative: text('narrative').notNull().default(''),
    type: text('type').notNull(),
    successCriteria: text('success_criteria').notNull().default(''),
    targetDate: date('target_date', { mode: 'string' }),
    lifeDomain: text('life_domain').notNull(),
    state: text('state').notNull().default('incubating'),
    creationAuthority: text('creation_authority').notNull().default('manual'),
    sourceProposalId: uuid('source_proposal_id'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('goals_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'goals_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceProposalId, table.userId],
      foreignColumns: [proposals.id, proposals.userId],
      name: 'goals_source_proposal_owner_fk',
    }).onDelete('restrict'),
    check(
      'goals_title_valid',
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check('goals_narrative_valid', sql`length(${table.narrative}) <= 4000`),
    check(
      'goals_success_criteria_valid',
      sql`length(${table.successCriteria}) <= 2000`,
    ),
    check(
      'goals_life_domain_valid',
      sql`length(btrim(${table.lifeDomain})) between 1 and 100`,
    ),
    check('goals_type_valid', sql`${table.type} in ('outcome', 'behavioural')`),
    check(
      'goals_state_valid',
      sql`${table.state} in ('incubating', 'active', 'paused', 'completed', 'retired', 'merged')`,
    ),
    check(
      'goals_creation_authority_valid',
      sql`${table.creationAuthority} in ('manual', 'accepted_proposal')`,
    ),
    check(
      'goals_source_authority_valid',
      sql`(${table.creationAuthority} = 'manual' and ${table.sourceProposalId} is null) or (${table.creationAuthority} = 'accepted_proposal' and ${table.sourceProposalId} is not null)`,
    ),
    check('goals_version_positive', sql`${table.version} > 0`),
    index('goals_user_state_updated_idx').on(
      table.userId,
      table.state,
      table.updatedAt,
    ),
    index('goals_user_target_date_idx').on(table.userId, table.targetDate),
  ],
);

export const edgeTypeRegistry = pgTable(
  'edge_type_registry',
  {
    key: text('key').primaryKey(),
    description: text('description').notNull(),
    semanticsVersion: integer('semantics_version').notNull().default(1),
    symmetric: boolean('symmetric').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check(
      'edge_type_registry_key_valid',
      sql`${table.key} ~ '^[a-z][a-z0-9_]{2,63}$'`,
    ),
    check(
      'edge_type_registry_semantics_version_positive',
      sql`${table.semanticsVersion} > 0`,
    ),
  ],
);

export const edges = pgTable(
  'edges',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceResourceId: uuid('source_resource_id').notNull(),
    targetResourceId: uuid('target_resource_id').notNull(),
    edgeType: text('edge_type')
      .notNull()
      .references(() => edgeTypeRegistry.key, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('edges_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.sourceResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'edges_source_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.targetResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'edges_target_owner_fk',
    }).onDelete('cascade'),
    check(
      'edges_distinct_resources',
      sql`${table.sourceResourceId} <> ${table.targetResourceId}`,
    ),
    check(
      'edges_removed_valid',
      sql`${table.removedAt} is null or ${table.removedAt} >= ${table.createdAt}`,
    ),
    check('edges_version_positive', sql`${table.version} > 0`),
    uniqueIndex('edges_active_relation_unique')
      .on(
        table.userId,
        table.sourceResourceId,
        table.targetResourceId,
        table.edgeType,
      )
      .where(sql`${table.removedAt} is null`),
    index('edges_user_source_idx').on(
      table.userId,
      table.sourceResourceId,
      table.removedAt,
    ),
    index('edges_user_target_idx').on(
      table.userId,
      table.targetResourceId,
      table.removedAt,
    ),
  ],
);

export const schedulingProposals = pgTable(
  'scheduling_proposals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    taskId: uuid('task_id'),
    goalId: uuid('goal_id'),
    earliestStart: timestamp('earliest_start', {
      withTimezone: true,
    }).notNull(),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    timeZone: text('time_zone').notNull(),
    estimatedEffortMinutes: integer('estimated_effort_minutes').notNull(),
    minBlockMinutes: integer('min_block_minutes').notNull(),
    maxBlockMinutes: integer('max_block_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull(),
    maxDeepWorkMinutesPerDay: integer(
      'max_deep_work_minutes_per_day',
    ).notNull(),
    workingWindows: jsonb('working_windows').notNull(),
    candidates: jsonb('candidates').notNull(),
    capacityMinutes: integer('capacity_minutes').notNull(),
    scheduledMinutes: integer('scheduled_minutes').notNull(),
    verdict: text('verdict').notNull(),
    exclusions: jsonb('exclusions').notNull(),
    alternatives: jsonb('alternatives').notNull(),
    state: text('state').notNull().default('pending'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('scheduling_proposals_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
      name: 'scheduling_proposals_task_owner_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
      name: 'scheduling_proposals_goal_owner_fk',
    }).onDelete('restrict'),
    check(
      'scheduling_proposals_target_valid',
      sql`${table.taskId} is not null or ${table.goalId} is not null`,
    ),
    check(
      'scheduling_proposals_horizon_valid',
      sql`${table.deadline} > ${table.earliestStart}`,
    ),
    check(
      'scheduling_proposals_title_valid',
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      'scheduling_proposals_constraints_valid',
      sql`${table.estimatedEffortMinutes} >= 15 and ${table.minBlockMinutes} >= 15 and ${table.maxBlockMinutes} >= ${table.minBlockMinutes} and ${table.bufferMinutes} between 0 and 240 and ${table.maxDeepWorkMinutesPerDay} >= ${table.minBlockMinutes}`,
    ),
    check(
      'scheduling_proposals_json_valid',
      sql`jsonb_typeof(${table.workingWindows}) = 'array' and jsonb_typeof(${table.candidates}) = 'array' and jsonb_typeof(${table.exclusions}) = 'array' and jsonb_typeof(${table.alternatives}) = 'array'`,
    ),
    check(
      'scheduling_proposals_capacity_valid',
      sql`${table.capacityMinutes} >= 0 and ${table.scheduledMinutes} >= 0 and ${table.scheduledMinutes} <= ${table.estimatedEffortMinutes}`,
    ),
    check(
      'scheduling_proposals_verdict_valid',
      sql`${table.verdict} in ('feasible', 'tight', 'infeasible')`,
    ),
    check(
      'scheduling_proposals_state_valid',
      sql`${table.state} in ('pending', 'accepted', 'dismissed', 'stale')`,
    ),
    check('scheduling_proposals_version_positive', sql`${table.version} > 0`),
    index('scheduling_proposals_user_state_idx').on(
      table.userId,
      table.state,
      table.updatedAt,
    ),
  ],
);

export const calendarBlocks = pgTable(
  'calendar_blocks',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').notNull(),
    taskId: uuid('task_id'),
    goalId: uuid('goal_id'),
    ordinal: integer('ordinal').notNull(),
    title: text('title').notNull(),
    plannedEffortMinutes: integer('planned_effort_minutes').notNull(),
    originalStartsAt: timestamp('original_starts_at', {
      withTimezone: true,
    }).notNull(),
    originalEndsAt: timestamp('original_ends_at', {
      withTimezone: true,
    }).notNull(),
    currentStartsAt: timestamp('current_starts_at', {
      withTimezone: true,
    }).notNull(),
    currentEndsAt: timestamp('current_ends_at', {
      withTimezone: true,
    }).notNull(),
    timeZone: text('time_zone').notNull(),
    state: text('state').notNull().default('planned'),
    approvalRecordedAt: timestamp('approval_recorded_at', {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('calendar_blocks_id_user_unique').on(table.id, table.userId),
    unique('calendar_blocks_proposal_ordinal_unique').on(
      table.userId,
      table.proposalId,
      table.ordinal,
    ),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'calendar_blocks_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.proposalId, table.userId],
      foreignColumns: [schedulingProposals.id, schedulingProposals.userId],
      name: 'calendar_blocks_proposal_owner_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
      name: 'calendar_blocks_task_owner_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
      name: 'calendar_blocks_goal_owner_fk',
    }).onDelete('restrict'),
    check(
      'calendar_blocks_title_valid',
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      'calendar_blocks_time_valid',
      sql`${table.originalEndsAt} > ${table.originalStartsAt} and ${table.currentEndsAt} > ${table.currentStartsAt}`,
    ),
    check(
      'calendar_blocks_effort_valid',
      sql`${table.plannedEffortMinutes} >= 15`,
    ),
    check('calendar_blocks_ordinal_valid', sql`${table.ordinal} > 0`),
    check(
      'calendar_blocks_state_valid',
      sql`${table.state} in ('planned', 'cancelled')`,
    ),
    check('calendar_blocks_version_positive', sql`${table.version} > 0`),
    index('calendar_blocks_user_window_idx').on(
      table.userId,
      table.currentStartsAt,
      table.currentEndsAt,
    ),
  ],
);

export const executionRecords = pgTable(
  'execution_records',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarBlockId: uuid('calendar_block_id'),
    taskId: uuid('task_id'),
    sourceReceiptId: uuid('source_receipt_id'),
    confidenceClass: text('confidence_class').notNull(),
    evidenceType: text('evidence_type').notNull(),
    outcome: text('outcome').notNull(),
    source: text('source').notNull(),
    reportedDurationMinutes: integer('reported_duration_minutes'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    retractedAt: timestamp('retracted_at', { withTimezone: true }),
    retractionReason: text('retraction_reason'),
  },
  (table) => [
    unique('execution_records_id_user_unique').on(table.id, table.userId),
    unique('execution_records_block_user_unique').on(
      table.calendarBlockId,
      table.userId,
    ),
    unique('execution_records_receipt_user_unique').on(
      table.sourceReceiptId,
      table.userId,
    ),
    foreignKey({
      columns: [table.calendarBlockId, table.userId],
      foreignColumns: [calendarBlocks.id, calendarBlocks.userId],
      name: 'execution_records_block_owner_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
      name: 'execution_records_task_owner_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.sourceReceiptId, table.userId],
      foreignColumns: [todayReceipts.id, todayReceipts.userId],
      name: 'execution_records_receipt_owner_fk',
    }).onDelete('restrict'),
    check(
      'execution_records_target_valid',
      sql`${table.calendarBlockId} is not null or ${table.taskId} is not null`,
    ),
    check(
      'execution_records_evidence_type_valid',
      sql`${table.evidenceType} in ('user_completed_task', 'post_block_confirmed', 'focus_session_recorded', 'external_task_completed', 'calendar_elapsed_unknown', 'user_reported_not_done')`,
    ),
    check(
      'execution_records_confidence_class_valid',
      sql`${table.confidenceClass} in ('owner_confirmed', 'locally_observed', 'externally_confirmed', 'unknown')`,
    ),
    check(
      'execution_records_evidence_confidence_valid',
      sql`(${table.evidenceType} in ('user_completed_task', 'post_block_confirmed', 'user_reported_not_done') and ${table.confidenceClass} = 'owner_confirmed') or (${table.evidenceType} = 'focus_session_recorded' and ${table.confidenceClass} = 'locally_observed') or (${table.evidenceType} = 'external_task_completed' and ${table.confidenceClass} = 'externally_confirmed') or (${table.evidenceType} = 'calendar_elapsed_unknown' and ${table.confidenceClass} = 'unknown')`,
    ),
    check(
      'execution_records_outcome_valid',
      sql`${table.outcome} in ('confirmed_completed', 'confirmed_partial', 'unknown', 'not_completed', 'rescheduled')`,
    ),
    check(
      'execution_records_source_valid',
      sql`${table.source} in ('today_task_completion', 'post_block_confirmation', 'elapsed_block_reconciliation')`,
    ),
    check(
      'execution_records_duration_valid',
      sql`${table.reportedDurationMinutes} is null or ${table.reportedDurationMinutes} > 0`,
    ),
    check(
      'execution_records_retraction_valid',
      sql`(${table.retractedAt} is null and ${table.retractionReason} is null) or (${table.retractedAt} is not null and ${table.retractionReason} = 'owner_undo')`,
    ),
    index('execution_records_user_occurred_idx').on(
      table.userId,
      table.occurredAt,
    ),
    index('execution_records_user_block_idx').on(
      table.userId,
      table.calendarBlockId,
    ),
  ],
);

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    authors: jsonb('authors').notNull().default([]),
    sourceClass: text('source_class').notNull(),
    publisherOrVenue: text('publisher_or_venue'),
    publicationDate: date('publication_date'),
    doi: text('doi'),
    canonicalUrl: text('canonical_url'),
    language: text('language').notNull(),
    ownerNotes: text('owner_notes'),
    reviewStatus: text('review_status').notNull().default('unreviewed'),
    evidenceDomain: jsonb('evidence_domain').notNull().default([]),
    copyrightAndUseNotes: text('copyright_and_use_notes').notNull(),
    correctionStatus: text('correction_status').notNull().default('unknown'),
    deletionRequestedAt: timestamp('deletion_requested_at', {
      withTimezone: true,
    }),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('knowledge_sources_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'knowledge_sources_resource_owner_fk',
    }).onDelete('cascade'),
    check(
      'knowledge_sources_title_valid',
      sql`length(btrim(${table.title})) between 1 and 500`,
    ),
    check(
      'knowledge_sources_authors_array',
      sql`jsonb_typeof(${table.authors}) = 'array'`,
    ),
    check(
      'knowledge_sources_evidence_domain_array',
      sql`jsonb_typeof(${table.evidenceDomain}) = 'array'`,
    ),
    check(
      'knowledge_sources_class_valid',
      sql`${table.sourceClass} in ('systematic_review_or_meta_analysis', 'randomised_trial', 'controlled_non_randomised_study', 'observational_study', 'mechanistic_or_laboratory_study', 'clinical_or_professional_guideline', 'narrative_review', 'expert_commentary', 'book_or_chapter', 'podcast_or_transcript', 'personal_notes', 'unknown')`,
    ),
    check(
      'knowledge_sources_review_status_valid',
      sql`${table.reviewStatus} in ('unreviewed', 'processing', 'reviewed', 'reference_only', 'rejected', 'superseded')`,
    ),
    check(
      'knowledge_sources_correction_status_valid',
      sql`${table.correctionStatus} in ('unknown', 'none_known', 'corrected', 'retracted', 'expression_of_concern')`,
    ),
    check('knowledge_sources_version_positive', sql`${table.version} > 0`),
    index('knowledge_sources_user_updated_idx').on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const knowledgeSourceRevisions = pgTable(
  'knowledge_source_revisions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    knowledgeSourceId: uuid('knowledge_source_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    originalFileRef: text('original_file_ref').notNull(),
    originalFileName: text('original_file_name').notNull(),
    originalMediaType: text('original_media_type').notNull(),
    originalContentHash: text('original_content_hash').notNull(),
    parsedText: text('parsed_text').notNull(),
    parserId: text('parser_id').notNull(),
    parserVersion: text('parser_version').notNull(),
    fileFormat: text('file_format').notNull(),
    extractionQuality: text('extraction_quality').notNull(),
    pageOrSectionMap: jsonb('page_or_section_map').notNull().default([]),
    processingClass: text('processing_class').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('knowledge_source_revisions_id_user_unique').on(
      table.id,
      table.userId,
    ),
    unique('knowledge_source_revisions_source_number_unique').on(
      table.knowledgeSourceId,
      table.revisionNumber,
    ),
    unique('knowledge_source_revisions_user_hash_unique').on(
      table.userId,
      table.originalContentHash,
    ),
    foreignKey({
      columns: [table.knowledgeSourceId, table.userId],
      foreignColumns: [knowledgeSources.id, knowledgeSources.userId],
      name: 'knowledge_source_revisions_source_owner_fk',
    }).onDelete('cascade'),
    check(
      'knowledge_source_revisions_number_positive',
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      'knowledge_source_revisions_hash_length',
      sql`length(${table.originalContentHash}) = 64`,
    ),
    check(
      'knowledge_source_revisions_map_array',
      sql`jsonb_typeof(${table.pageOrSectionMap}) = 'array'`,
    ),
    check(
      'knowledge_source_revisions_format_valid',
      sql`${table.fileFormat} in ('plain_text', 'markdown', 'pdf')`,
    ),
    check(
      'knowledge_source_revisions_quality_valid',
      sql`${table.extractionQuality} in ('complete', 'partial', 'ocr_required', 'failed')`,
    ),
    check(
      'knowledge_source_revisions_processing_class_valid',
      sql`${table.processingClass} in ('standard', 'sensitive', 'private')`,
    ),
    index('knowledge_source_revisions_user_source_idx').on(
      table.userId,
      table.knowledgeSourceId,
      table.revisionNumber,
    ),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    sourceSpanStart: integer('source_span_start').notNull(),
    sourceSpanEnd: integer('source_span_end').notNull(),
    contentHash: text('content_hash').notNull(),
    locator: jsonb('locator'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('knowledge_chunks_id_user_unique').on(table.id, table.userId),
    unique('knowledge_chunks_revision_ordinal_unique').on(
      table.sourceRevisionId,
      table.ordinal,
    ),
    foreignKey({
      columns: [table.sourceRevisionId, table.userId],
      foreignColumns: [
        knowledgeSourceRevisions.id,
        knowledgeSourceRevisions.userId,
      ],
      name: 'knowledge_chunks_revision_owner_fk',
    }).onDelete('cascade'),
    check('knowledge_chunks_ordinal_positive', sql`${table.ordinal} > 0`),
    check(
      'knowledge_chunks_span_valid',
      sql`${table.sourceSpanStart} >= 0 and ${table.sourceSpanEnd} > ${table.sourceSpanStart}`,
    ),
    check(
      'knowledge_chunks_hash_length',
      sql`length(${table.contentHash}) = 64`,
    ),
    index('knowledge_chunks_user_revision_idx').on(
      table.userId,
      table.sourceRevisionId,
      table.ordinal,
    ),
  ],
);

export const knowledgeClaims = pgTable(
  'knowledge_claims',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    knowledgeSourceId: uuid('knowledge_source_id').notNull(),
    claimText: text('claim_text').notNull(),
    claimType: text('claim_type').notNull(),
    epistemicStatus: text('epistemic_status').notNull(),
    populationScope: text('population_scope'),
    interventionOrExposure: text('intervention_or_exposure'),
    outcome: text('outcome'),
    direction: text('direction'),
    effectExpression: text('effect_expression'),
    reviewStatus: text('review_status').notNull().default('candidate'),
    reviewerNotes: text('reviewer_notes'),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('knowledge_claims_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.id, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'knowledge_claims_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.knowledgeSourceId, table.userId],
      foreignColumns: [knowledgeSources.id, knowledgeSources.userId],
      name: 'knowledge_claims_source_owner_fk',
    }).onDelete('cascade'),
    check(
      'knowledge_claims_text_valid',
      sql`length(${table.claimText}) between 1 and 4000`,
    ),
    check(
      'knowledge_claims_type_valid',
      sql`${table.claimType} in ('finding', 'mechanism', 'recommendation', 'limitation', 'contraindication', 'measurement', 'population', 'dose_or_schedule', 'uncertainty')`,
    ),
    check(
      'knowledge_claims_epistemic_status_valid',
      sql`${table.epistemicStatus} in ('reported_by_source', 'supported', 'mixed', 'contested', 'unsupported', 'unknown')`,
    ),
    check(
      'knowledge_claims_review_status_valid',
      sql`${table.reviewStatus} in ('candidate', 'reviewed', 'rejected', 'superseded')`,
    ),
    check('knowledge_claims_version_positive', sql`${table.version} > 0`),
    index('knowledge_claims_user_source_idx').on(
      table.userId,
      table.knowledgeSourceId,
      table.updatedAt,
    ),
  ],
);

export const knowledgeClaimCitations = pgTable(
  'knowledge_claim_citations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    claimId: uuid('claim_id').notNull(),
    sourceRevisionId: uuid('source_revision_id').notNull(),
    sourceSpanStart: integer('source_span_start').notNull(),
    sourceSpanEnd: integer('source_span_end').notNull(),
    quotedTextHash: text('quoted_text_hash').notNull(),
    locator: jsonb('locator'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('knowledge_claim_citations_id_user_unique').on(
      table.id,
      table.userId,
    ),
    foreignKey({
      columns: [table.claimId, table.userId],
      foreignColumns: [knowledgeClaims.id, knowledgeClaims.userId],
      name: 'knowledge_claim_citations_claim_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceRevisionId, table.userId],
      foreignColumns: [
        knowledgeSourceRevisions.id,
        knowledgeSourceRevisions.userId,
      ],
      name: 'knowledge_claim_citations_revision_owner_fk',
    }).onDelete('cascade'),
    check(
      'knowledge_claim_citations_span_valid',
      sql`${table.sourceSpanStart} >= 0 and ${table.sourceSpanEnd} > ${table.sourceSpanStart}`,
    ),
    check(
      'knowledge_claim_citations_hash_length',
      sql`length(${table.quotedTextHash}) = 64`,
    ),
    index('knowledge_claim_citations_user_claim_idx').on(
      table.userId,
      table.claimId,
    ),
  ],
);

export const retrievalEmbeddings = pgTable(
  'retrieval_embeddings',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lane: text('lane').notNull(),
    sourceKind: text('source_kind').notNull(),
    entryRevisionId: uuid('entry_revision_id'),
    knowledgeChunkId: uuid('knowledge_chunk_id'),
    contentHash: text('content_hash').notNull(),
    modelId: text('model_id').notNull(),
    modelVersion: text('model_version').notNull(),
    dimensions: integer('dimensions').notNull(),
    embedding: unconstrainedVector('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('retrieval_embeddings_id_user_unique').on(table.id, table.userId),
    unique('retrieval_embeddings_entry_model_unique').on(
      table.userId,
      table.entryRevisionId,
      table.modelId,
      table.modelVersion,
    ),
    unique('retrieval_embeddings_chunk_model_unique').on(
      table.userId,
      table.knowledgeChunkId,
      table.modelId,
      table.modelVersion,
    ),
    foreignKey({
      columns: [table.entryRevisionId, table.userId],
      foreignColumns: [entryRevisions.id, entryRevisions.userId],
      name: 'retrieval_embeddings_entry_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.knowledgeChunkId, table.userId],
      foreignColumns: [knowledgeChunks.id, knowledgeChunks.userId],
      name: 'retrieval_embeddings_chunk_owner_fk',
    }).onDelete('cascade'),
    check(
      'retrieval_embeddings_lane_source_valid',
      sql`(${table.lane} = 'personal' and ${table.sourceKind} = 'entry_revision' and ${table.entryRevisionId} is not null and ${table.knowledgeChunkId} is null) or (${table.lane} = 'external' and ${table.sourceKind} = 'knowledge_chunk' and ${table.entryRevisionId} is null and ${table.knowledgeChunkId} is not null)`,
    ),
    check(
      'retrieval_embeddings_hash_length',
      sql`length(${table.contentHash}) = 64`,
    ),
    check(
      'retrieval_embeddings_model_valid',
      sql`length(btrim(${table.modelId})) between 1 and 120 and length(btrim(${table.modelVersion})) between 1 and 120`,
    ),
    check(
      'retrieval_embeddings_dimensions_valid',
      sql`${table.dimensions} between 1 and 16000 and vector_dims(${table.embedding}) = ${table.dimensions}`,
    ),
    check(
      'retrieval_embeddings_vector_nonzero',
      sql`vector_norm(${table.embedding}) > 0`,
    ),
    index('retrieval_embeddings_user_lane_model_idx').on(
      table.userId,
      table.lane,
      table.modelId,
      table.modelVersion,
    ),
  ],
);

export const contextManifests = pgTable(
  'context_manifests',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    policyVersion: text('policy_version').notNull(),
    semanticRetrievalActive: boolean('semantic_retrieval_active')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('context_manifests_id_user_unique').on(table.id, table.userId),
    check(
      'context_manifests_purpose_valid',
      sql`${table.purpose} in ('recall_preview', 'material_response')`,
    ),
    check(
      'context_manifests_policy_valid',
      sql`length(btrim(${table.policyVersion})) between 1 and 80`,
    ),
    index('context_manifests_user_created_idx').on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const contextManifestItems = pgTable(
  'context_manifest_items',
  {
    manifestId: uuid('manifest_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    evidenceLane: text('evidence_lane').notNull(),
    sourceKind: text('source_kind'),
    resourceId: uuid('resource_id'),
    entryRevisionId: uuid('entry_revision_id'),
    knowledgeChunkId: uuid('knowledge_chunk_id'),
    knowledgeSourceRevisionId: uuid('knowledge_source_revision_id'),
    contentHash: text('content_hash'),
    methods: text('methods').array().notNull().default([]),
    score: numeric('score', { precision: 10, scale: 8 }),
    policyReference: text('policy_reference'),
  },
  (table) => [
    primaryKey({ columns: [table.manifestId, table.ordinal] }),
    foreignKey({
      columns: [table.manifestId, table.userId],
      foreignColumns: [contextManifests.id, contextManifests.userId],
      name: 'context_manifest_items_manifest_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
      name: 'context_manifest_items_resource_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.entryRevisionId, table.userId],
      foreignColumns: [entryRevisions.id, entryRevisions.userId],
      name: 'context_manifest_items_entry_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.knowledgeChunkId, table.userId],
      foreignColumns: [knowledgeChunks.id, knowledgeChunks.userId],
      name: 'context_manifest_items_chunk_owner_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.knowledgeSourceRevisionId, table.userId],
      foreignColumns: [
        knowledgeSourceRevisions.id,
        knowledgeSourceRevisions.userId,
      ],
      name: 'context_manifest_items_revision_owner_fk',
    }).onDelete('cascade'),
    check('context_manifest_items_ordinal_positive', sql`${table.ordinal} > 0`),
    check(
      'context_manifest_items_lane_valid',
      sql`${table.evidenceLane} in ('personal_evidence', 'external_evidence', 'system_policy')`,
    ),
    check(
      'context_manifest_items_methods_valid',
      sql`${table.methods} <@ ARRAY['pinned', 'metadata', 'full_text', 'semantic']::text[]`,
    ),
    check(
      'context_manifest_items_score_valid',
      sql`${table.score} is null or (${table.score} >= 0 and ${table.score} <= 1)`,
    ),
    check(
      'context_manifest_items_reference_valid',
      sql`(${table.evidenceLane} = 'system_policy' and ${table.sourceKind} is null and ${table.resourceId} is null and ${table.entryRevisionId} is null and ${table.knowledgeChunkId} is null and ${table.knowledgeSourceRevisionId} is null and ${table.contentHash} is null and cardinality(${table.methods}) = 0 and ${table.score} is null and ${table.policyReference} is not null) or (${table.evidenceLane} = 'personal_evidence' and ${table.sourceKind} = 'entry_revision' and ${table.resourceId} is not null and ${table.entryRevisionId} is not null and ${table.knowledgeChunkId} is null and ${table.knowledgeSourceRevisionId} is null and ${table.contentHash} is not null and cardinality(${table.methods}) > 0 and ${table.score} is not null and ${table.policyReference} is null) or (${table.evidenceLane} = 'external_evidence' and ${table.sourceKind} = 'knowledge_chunk' and ${table.resourceId} is not null and ${table.entryRevisionId} is null and ${table.knowledgeChunkId} is not null and ${table.knowledgeSourceRevisionId} is not null and ${table.contentHash} is not null and cardinality(${table.methods}) > 0 and ${table.score} is not null and ${table.policyReference} is null)`,
    ),
    check(
      'context_manifest_items_hash_length',
      sql`${table.contentHash} is null or length(${table.contentHash}) = 64`,
    ),
    index('context_manifest_items_user_manifest_idx').on(
      table.userId,
      table.manifestId,
      table.ordinal,
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
    lastErrorCode: text('last_error_code'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
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
    check(
      'outbox_messages_error_code_valid',
      sql`${table.lastErrorCode} is null or ${table.lastErrorCode} ~ '^[A-Z][A-Z0-9_]{2,63}$'`,
    ),
    check(
      'outbox_messages_terminal_state_valid',
      sql`(${table.status} = 'succeeded' and ${table.processedAt} is not null and ${table.deadLetteredAt} is null) or (${table.status} = 'failed' and ${table.processedAt} is null and ${table.deadLetteredAt} is not null and ${table.lastErrorCode} is not null) or (${table.status} not in ('succeeded', 'failed') and ${table.processedAt} is null and ${table.deadLetteredAt} is null)`,
    ),
    index('outbox_messages_claim_idx').on(table.status, table.availableAt),
    index('outbox_messages_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const schemaTables = {
  agendaBlocks,
  calendarBlocks,
  authCredentials,
  authEvents,
  authRateLimits,
  authSessions,
  commandReceipts,
  contextManifestItems,
  contextManifests,
  dailyPriorities,
  derivationLinks,
  domainEvents,
  edges,
  edgeTypeRegistry,
  entries,
  entryRevisions,
  goals,
  knowledgeClaimCitations,
  knowledgeClaims,
  knowledgeChunks,
  knowledgeSourceRevisions,
  knowledgeSources,
  outboxMessages,
  proposals,
  reminderOccurrences,
  reminders,
  retrievalEmbeddings,
  resources,
  recoveryCodes,
  schemaRegistry,
  schedulingProposals,
  tasks,
  todayReceipts,
  users,
} as const;
