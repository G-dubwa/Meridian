import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  DerivationLinkRecord,
  EntryRecord,
  EntryRevisionRecord,
  InterpretationOutputV1,
  ResourceRecord,
  MicrosoftOAuthGateway,
  ModelInvocationRequest,
  UserRecord,
  UserScope,
} from '../../packages/domain/src/index.js';
import {
  MICROSOFT_STAGE_A_SCOPES,
  MicrosoftOAuthGatewayError,
  derivationLinkIdV1Schema,
  entryIdV1Schema,
  entryRevisionIdV1Schema,
  resourceIdV1Schema,
  proposalIdV1Schema,
  userIdV1Schema,
  workerErrorCodeV1Schema,
} from '../../packages/domain/src/index.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../../packages/infrastructure-db/src/client.js';
import { DrizzleTransactionManager } from '../../packages/infrastructure-db/src/transaction-manager.js';
import { DrizzleOAuthAuthorizationSessionStore } from '../../packages/infrastructure-db/src/integration-repositories.js';
import {
  DrizzlePgBossOutboxDispatchGateway,
  DrizzleWorkerOutboxRepository,
} from '../../packages/infrastructure-db/src/worker-repositories.js';
import {
  JournalService,
  type MaterialChangeInvalidation,
  type MaterialChangeInvalidationHook,
} from '../../packages/application/src/journal.js';
import { ActionService } from '../../packages/application/src/actions.js';
import { TodayService } from '../../packages/application/src/today.js';
import { GoalService } from '../../packages/application/src/goals.js';
import {
  ProposalMaterialChangeInvalidationHook,
  TriageService,
} from '../../packages/application/src/triage.js';
import { InterpretationService } from '../../packages/application/src/interpretation.js';
import { ModelGatewayService } from '../../packages/application/src/model-gateway.js';
import {
  EventHandlingError,
  OUTBOX_QUEUE_V1,
  ReliableEventService,
} from '../../packages/application/src/reliable-events.js';
import { MicrosoftConnectionService } from '../../packages/application/src/microsoft-connection.js';
import {
  MeridianWorkerRuntime,
  ensureWorkerQueues,
} from '../../apps/worker/src/runtime.js';
import { PgBoss } from 'pg-boss';
import {
  CryptoIdGenerator,
  NodeSecretService,
} from '../../packages/infrastructure-auth/src/index.js';
import {
  Aes256GcmTokenCipher,
  NodePkceGenerator,
} from '../../packages/infrastructure-ms-graph/src/index.js';
import {
  TRIAGE_EXTRACTION_PROMPT_ID,
  TRIAGE_EXTRACTION_PROMPT_VERSION,
  renderTriageExtractionPromptV1,
  triageExtractionOutputJsonSchemaV1,
  triageExtractionOutputV1Schema,
  triageExtractionSystemInstructionV1,
} from '../../packages/prompts/src/index.js';

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) throw new Error('TEST_DATABASE_URL is required.');

const migrationsFolder = resolve('packages/infrastructure-db/migrations');
const admin = createDatabaseClient(adminUrl);
const appRole = 'meridian_app_test';
const appPassword = 'meridian-integration-only';
const appUrl = new URL(adminUrl);
appUrl.username = appRole;
appUrl.password = appPassword;

const userAId = userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01970');
const userBId = userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01971');
const scopeA = { userId: userAId } satisfies UserScope;
const scopeB = { userId: userBId } satisfies UserScope;
const entryId = entryIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01972');
const resourceId = resourceIdV1Schema.parse(entryId);
const revisionId = entryRevisionIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f01973',
);
const linkId = derivationLinkIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f01974',
);
const now = new Date('2026-07-18T08:00:00.000Z');

let app: ReturnType<typeof createDatabaseClient> | undefined;

afterAll(async () => {
  if (app) await app.sql.end();
  await admin.sql.unsafe(`drop owned by ${appRole}`);
  await admin.sql.unsafe(`drop role if exists ${appRole}`);
  await admin.sql.end();
});

describe('WP-03 PostgreSQL foundation', { concurrent: false }, () => {
  it('migrates an empty PostgreSQL database with pgvector installed but unused', async () => {
    await migrate(admin.database, { migrationsFolder });
    const tables = await admin.sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      'agenda_blocks',
      'auth_credentials',
      'auth_events',
      'auth_rate_limits',
      'auth_sessions',
      'command_receipts',
      'consent_records',
      'daily_priorities',
      'derivation_links',
      'domain_events',
      'edge_type_registry',
      'edges',
      'entries',
      'entry_revisions',
      'goals',
      'integration_accounts',
      'oauth_authorization_sessions',
      'outbox_messages',
      'proposals',
      'recovery_codes',
      'reminder_occurrences',
      'reminders',
      'resources',
      'schema_registry',
      'tasks',
      'today_receipts',
      'users',
    ]);
    const [vector] = await admin.sql<{ extversion: string }[]>`
      select extversion from pg_extension where extname = 'vector'
    `;
    if (!vector) throw new Error('pgvector extension was not installed.');
    expect(vector.extversion).toMatch(/^0\.8\./);
    const vectorColumns = await admin.sql`
      select 1 from information_schema.columns where udt_name = 'vector'
    `;
    expect(vectorColumns).toHaveLength(0);
    const partitions = await admin.sql`
      select 1 from pg_partitioned_table
      where partrelid in ('domain_events'::regclass, 'outbox_messages'::regclass)
    `;
    expect(partitions).toHaveLength(0);
  });

  it('upgrades a seeded previous migration snapshot without losing its user', async () => {
    const snapshotDatabase = 'meridian_seeded_snapshot_test';
    await admin.sql.unsafe(`drop database if exists ${snapshotDatabase}`);
    await admin.sql.unsafe(`create database ${snapshotDatabase}`);
    const snapshotUrl = new URL(adminUrl);
    snapshotUrl.pathname = `/${snapshotDatabase}`;
    const snapshotSql = postgres(snapshotUrl.toString(), { prepare: false });
    try {
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0000_wp03_database_foundation.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql`
        insert into users (id, home_time_zone)
        values ('018f0f77-34f1-7ef2-8ca1-7a3bf7f01979', 'Africa/Johannesburg')
      `;
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0001_wp03_security_registry.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0002_wp04_local_owner_authentication.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0003_wp05_walking_journal_slice.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0004_wp05_command_idempotency.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0005_wp06_reliable_event_processing.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0006_wp07_microsoft_connection_consent.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0007_wp09_interpretation_triage.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0008_wp10_tasks_canonical_reminders.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0009_wp13a_local_alpha_today.sql',
          ),
          'utf8',
        ),
      );
      await snapshotSql.unsafe(
        readFileSync(
          resolve(
            'packages/infrastructure-db/migrations/0010_wp14_goals_edges_load_guidance.sql',
          ),
          'utf8',
        ),
      );
      const [seeded] = await snapshotSql<{ count: string }[]>`
        select count(*)::text as count from users
      `;
      expect(seeded?.count).toBe('1');
      const [authTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.auth_credentials')::text as name
      `;
      expect(authTable?.name).toBe('auth_credentials');
      const [journalConstraint] = await snapshotSql<{ exists: boolean }[]>`
        select exists (
          select 1 from pg_constraint
          where conname = 'entry_revisions_content_hash_length'
        ) as exists
      `;
      expect(journalConstraint?.exists).toBe(true);
      const [workerColumn] = await snapshotSql<{ exists: boolean }[]>`
        select exists (
          select 1 from information_schema.columns
          where table_name = 'outbox_messages'
            and column_name = 'dead_lettered_at'
        ) as exists
      `;
      expect(workerColumn?.exists).toBe(true);
      const [integrationTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.integration_accounts')::text as name
      `;
      expect(integrationTable?.name).toBe('integration_accounts');
      const [proposalTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.proposals')::text as name
      `;
      expect(proposalTable?.name).toBe('proposals');
      const [reminderTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.reminders')::text as name
      `;
      expect(reminderTable?.name).toBe('reminders');
      const [agendaTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.agenda_blocks')::text as name
      `;
      expect(agendaTable?.name).toBe('agenda_blocks');
      const [goalTable] = await snapshotSql<{ name: string }[]>`
        select to_regclass('public.goals')::text as name
      `;
      expect(goalTable?.name).toBe('goals');
    } finally {
      await snapshotSql.end();
      await admin.sql.unsafe(`drop database if exists ${snapshotDatabase}`);
    }
  });

  it('enforces transaction-local owner scope with two fixture users', async () => {
    await admin.sql.unsafe(`drop role if exists ${appRole}`);
    await admin.sql.unsafe(
      `create role ${appRole} login password '${appPassword}'`,
    );
    await admin.sql.unsafe(`grant usage on schema public to ${appRole}`);
    await admin.sql.unsafe(
      `grant select on schema_registry, edge_type_registry to ${appRole}`,
    );
    await admin.sql.unsafe(
      `grant select, insert, update, delete on users, resources, entries, entry_revisions, derivation_links, domain_events, outbox_messages, proposals, tasks, reminders, reminder_occurrences, command_receipts, agenda_blocks, daily_priorities, today_receipts, goals, edges, integration_accounts, consent_records, oauth_authorization_sessions to ${appRole}`,
    );

    app = createDatabaseClient(appUrl.toString());
    const transactions = new DrizzleTransactionManager(app.database);
    const user = (id: UserRecord['id']): UserRecord => ({
      createdAt: now,
      homeTimeZone: 'Africa/Johannesburg',
      id,
      locale: 'en-ZA',
      settings: {},
      softActiveGoalLimit: 5,
      updatedAt: now,
    });
    await transactions.run(scopeA, async (ports) =>
      ports.users.save(user(userAId)),
    );
    await transactions.run(scopeB, async (ports) =>
      ports.users.save(user(userBId)),
    );

    const resource: ResourceRecord = {
      createdAt: now,
      deletedAt: null,
      id: resourceId,
      resourceType: 'resource.entry',
      scope: scopeA,
    };
    const entry: EntryRecord = {
      attrs: {},
      attrsSchemaKey: 'attrs.entry',
      attrsSchemaVersion: 1,
      createdAt: now,
      currentRevisionId: null,
      id: entryId,
      resourceId,
      scope: scopeA,
      sensitivity: 'normal',
      status: 'active',
      updatedAt: now,
      version: 1,
    };

    await expect(
      transactions.run(scopeA, async (ports) => ports.entries.save(entry)),
    ).rejects.toThrow();
    await transactions.run(scopeA, async (ports) => {
      await ports.resources.save(resource);
      await ports.entries.save(entry);
    });

    await expect(
      transactions.run(scopeA, async (ports) =>
        ports.entries.findById(scopeA, entryId),
      ),
    ).resolves.toMatchObject({ id: entryId });
    await expect(
      transactions.run(scopeB, async (ports) =>
        ports.entries.findById(scopeB, entryId),
      ),
    ).resolves.toBeNull();
    await expect(
      transactions.run(scopeA, async (ports) =>
        ports.entries.findById(scopeB, entryId),
      ),
    ).resolves.toBeNull();
    await expect(
      transactions.run(scopeA, async (ports) =>
        ports.resources.save({
          ...resource,
          id: resourceIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01978'),
          scope: scopeB,
        }),
      ),
    ).rejects.toThrow();
  });

  it('keeps journal revisions immutable, current updates atomic, and Private revisions outside AI queries', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const ids = new CryptoIdGenerator();
    const secrets = new NodeSecretService();
    const clock = { now: () => new Date(now) };
    const invalidations: MaterialChangeInvalidation[] = [];
    const proposalInvalidation = new ProposalMaterialChangeInvalidationHook(
      clock,
    );
    const invalidation: MaterialChangeInvalidationHook = {
      invalidate(change, ports) {
        invalidations.push(change);
        return proposalInvalidation.invalidate(change, ports);
      },
    };
    const journal = new JournalService({
      clock,
      contentHasher: secrets,
      ids,
      invalidation,
      transactions,
    });
    const standardContext = { correlationId: ids.next() };
    const [standard, retried] = await Promise.all([
      journal.createEntry(
        scopeB,
        {
          bodyMarkdown: 'A standard source revision.',
          processingClass: 'standard',
        },
        standardContext,
      ),
      journal.createEntry(
        scopeB,
        {
          bodyMarkdown: 'Retry body is ignored for the same command identity.',
          processingClass: 'private',
        },
        standardContext,
      ),
    ]);
    expect(retried.entry.id).toBe(standard.entry.id);

    const revised = await journal.reviseEntry(
      scopeB,
      standard.entry.id,
      {
        bodyMarkdown: 'A revised standard source revision.',
        expectedVersion: standard.entry.version,
        processingClass: 'standard',
      },
      { correlationId: ids.next() },
    );
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0]?.bodyMarkdown).toBe(
      'A standard source revision.',
    );
    expect(revised.entry.currentRevisionId).toBe(revised.currentRevision.id);
    expect(invalidations).toHaveLength(1);

    const privateEntry = await journal.createEntry(
      scopeB,
      {
        bodyMarkdown: 'This remains local display only.',
        processingClass: 'private',
      },
      { correlationId: ids.next() },
    );
    const eligible = await transactions.run(scopeB, (ports) =>
      ports.entryRevisions.findCurrentForAiProcessing(scopeB, 20),
    );
    expect(eligible.map((revision) => revision.id)).toEqual([
      revised.currentRevision.id,
    ]);
    expect(
      eligible.some((revision) => revision.entryId === privateEntry.entry.id),
    ).toBe(false);

    const triage = new TriageService({
      clock,
      ids,
      transactions,
    });
    const actions = new ActionService({
      clock,
      ids,
      transactions,
    });
    const modelRequests: ModelInvocationRequest[] = [];
    const interpretationService = new InterpretationService({
      gateway: new ModelGatewayService({
        adapter: {
          invoke(request) {
            modelRequests.push(request);
            return Promise.resolve({
              latencyMilliseconds: 12,
              modelId: request.modelId,
              output: {
                clarificationQuestion: null,
                outcome: 'proposals',
                proposals: [
                  {
                    assertionClass: 'strong_interpretation',
                    authorityClass: 'inferred_structure',
                    confidence: 0.95,
                    detail: null,
                    kind: 'task',
                    sourceSpanEnd: 9,
                    sourceSpanStart: 0,
                    sourceText: 'A revised',
                    temporalPhrase: null,
                    title: 'Review the revised notes',
                    uncertaintyIndicators: [],
                  },
                  {
                    assertionClass: 'explicit_statement',
                    authorityClass: 'inferred_structure',
                    confidence: 0.96,
                    detail: null,
                    kind: 'reminder',
                    sourceSpanEnd: 18,
                    sourceSpanStart: 10,
                    sourceText: 'standard',
                    temporalPhrase: null,
                    title: 'Revisit the standard note',
                    uncertaintyIndicators: [],
                  },
                  {
                    assertionClass: 'weak_inference',
                    authorityClass: 'inferred_structure',
                    confidence: 0.94,
                    detail: null,
                    kind: 'commitment',
                    sourceSpanEnd: 25,
                    sourceSpanStart: 19,
                    sourceText: 'source',
                    temporalPhrase: null,
                    title: 'Follow up on the source',
                    uncertaintyIndicators: [],
                  },
                ],
                schemaVersion: 1,
                uncertaintyIndicators: [],
              },
              provider: 'openai',
              providerRequestId: 'synthetic-request',
              providerStatusCode: 200,
              usage: {
                cachedInputTokens: 0,
                inputTokens: 100,
                outputTokens: 40,
              },
            });
          },
        },
        consent: {
          sensitiveExternalEmbedding: false,
          sensitiveExternalLlm: false,
          sensitiveProactiveSurfacing: false,
          standardProactiveEvidenceEligible: false,
        },
        observations: { observe: () => undefined },
      }),
      hasher: secrets,
      prompt: {
        id: TRIAGE_EXTRACTION_PROMPT_ID,
        outputSchema: triageExtractionOutputJsonSchemaV1,
        parse: (output) => triageExtractionOutputV1Schema.parse(output),
        render: renderTriageExtractionPromptV1,
        systemInstruction: triageExtractionSystemInstructionV1,
        version: TRIAGE_EXTRACTION_PROMPT_VERSION,
      },
      transactions,
      triage,
    });
    const interpretation = await interpretationService.proposeForRevision(
      scopeB,
      revised.currentRevision.id,
      true,
      { correlationId: ids.next() },
    );
    expect(modelRequests).toHaveLength(1);
    expect(modelRequests[0]).toMatchObject({
      modelId: 'gpt-5.6-sol',
      outputAuthority: 'triage_proposal_only',
      purpose: 'production',
      reasoningEffort: 'none',
      taskClass: 'bounded_extraction',
    });
    await expect(
      interpretationService.proposeForRevision(
        scopeB,
        privateEntry.currentRevision.id,
        true,
        { correlationId: ids.next() },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AUTHORITY' });
    expect(modelRequests).toHaveLength(1);
    expect(interpretation.outcome).toBe('proposals');
    const proposal = interpretation.proposals[0];
    if (!proposal) throw new Error('Expected a proposal fixture.');
    const editableProposal = interpretation.proposals[1];
    const dismissibleProposal = interpretation.proposals[2];
    if (!editableProposal || !dismissibleProposal) {
      throw new Error('Expected edit and dismissal proposal fixtures.');
    }
    expect(proposalIdV1Schema.parse(proposal.id)).toBe(proposal.id);
    await expect(triage.list(scopeA)).resolves.not.toContainEqual(
      expect.objectContaining({ id: proposal.id }),
    );
    const accepted = await actions.acceptProposal(
      scopeB,
      proposal.id,
      {
        decision: 'accept',
        expectedVersion: proposal.version,
        ownerConfirmed: true,
      },
      { correlationId: ids.next() },
    );
    expect(accepted.proposal.status).toBe('accepted');
    expect(accepted.target).toMatchObject({
      creationAuthority: 'accepted_proposal',
      sourceProposalId: proposal.id,
    });
    const edited = await actions.acceptProposal(
      scopeB,
      editableProposal.id,
      {
        acceptedReminder: {
          expiresAt: null,
          priority: 'normal',
          recurrence: null,
          timeZone: 'Africa/Johannesburg',
          triggerAt: '2026-07-20T13:00:00.000Z',
        },
        decision: 'edit_accept',
        editedPayload: {
          ...editableProposal.payload,
          title: 'Revisit this note tomorrow',
        },
        expectedVersion: editableProposal.version,
        ownerConfirmed: true,
      },
      { correlationId: ids.next() },
    );
    expect(edited.proposal).toMatchObject({
      payload: { title: 'Revisit this note tomorrow' },
      status: 'edited_accepted',
    });
    expect(edited.target).toMatchObject({
      creationAuthority: 'accepted_proposal',
      deliveryPolicy: 'undecided',
      sourceProposalId: editableProposal.id,
    });
    const dismissed = await triage.decide(
      scopeB,
      dismissibleProposal.id,
      {
        decision: 'dismiss',
        expectedVersion: dismissibleProposal.version,
        ownerConfirmed: true,
      },
      { correlationId: ids.next() },
    );
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.suppressionUntil).not.toBeNull();
    const suppressed = await triage.recordInterpretation(
      scopeB,
      revised.currentRevision.id,
      {
        clarificationQuestion: null,
        outcome: 'proposals',
        proposals: [
          {
            assertionClass: dismissed.assertionClass,
            authorityClass: dismissed.authorityClass,
            confidence: dismissed.confidence,
            dedupeKey: dismissed.dedupeKey,
            payload: dismissed.payload,
            sourceRevisionId: dismissed.sourceRevisionId,
            sourceSpanEnd: dismissed.sourceSpanEnd,
            sourceSpanStart: dismissed.sourceSpanStart,
            uncertaintyIndicators: [],
          },
        ],
        schemaVersion: 1,
        uncertaintyIndicators: [],
      },
      { correlationId: ids.next() },
    );
    expect(suppressed.outcome).toBe('no_action');
    await expect(triage.list(scopeB)).resolves.not.toContainEqual(
      expect.objectContaining({ id: proposal.id }),
    );
    const [proposalDerivation] = await admin.sql<{ count: string }[]>`
      select count(*)::text as count from derivation_links
      where derived_resource_id = ${proposal.resourceId}
        and source_revision_id = ${revised.currentRevision.id}
    `;
    expect(proposalDerivation?.count).toBe('1');

    const staleOutput: InterpretationOutputV1 = {
      clarificationQuestion: null,
      outcome: 'proposals',
      proposals: [
        {
          assertionClass: 'weak_inference',
          authorityClass: 'inferred_structure',
          confidence: 0.94,
          dedupeKey: 'c'.repeat(64),
          payload: {
            kind: 'commitment',
            schemaVersion: 1,
            title: 'Follow up on the notes',
          },
          sourceRevisionId: revised.currentRevision.id,
          sourceSpanEnd: 9,
          sourceSpanStart: 0,
          uncertaintyIndicators: [],
        },
      ],
      schemaVersion: 1,
      uncertaintyIndicators: [],
    };
    const staleCandidates = await Promise.all([
      triage.recordInterpretation(
        scopeB,
        revised.currentRevision.id,
        staleOutput,
        { correlationId: ids.next() },
      ),
      triage.recordInterpretation(
        scopeB,
        revised.currentRevision.id,
        staleOutput,
        { correlationId: ids.next() },
      ),
    ]);
    expect(staleCandidates.flatMap(({ proposals }) => proposals)).toHaveLength(
      1,
    );
    const pending = staleCandidates.flatMap(({ proposals }) => proposals)[0];
    if (!pending) throw new Error('Expected a pending proposal fixture.');
    await journal.reviseEntry(
      scopeB,
      revised.entry.id,
      {
        bodyMarkdown: 'A newer Standard source revision.',
        expectedVersion: revised.entry.version,
        processingClass: 'standard',
      },
      { correlationId: ids.next() },
    );
    const stale = await transactions.run(scopeB, (ports) =>
      ports.proposals.findById(scopeB, pending.id),
    );
    expect(stale?.status).toBe('stale');

    await journal.reviseEntry(
      scopeB,
      privateEntry.entry.id,
      {
        bodyMarkdown: privateEntry.currentRevision.bodyMarkdown,
        expectedVersion: privateEntry.entry.version,
        processingClass: 'sensitive',
      },
      { correlationId: ids.next() },
    );
    expect(invalidations).toHaveLength(3);
    expect(invalidations[2]?.changeKind).toBe('privacy');

    await expect(
      app.sql.begin(async (sql) => {
        await sql`select set_config('meridian.user_id', ${scopeB.userId}, true)`;
        await sql`
          update entry_revisions set body_markdown = 'mutation rejected'
          where id = ${revised.revisions[0]?.id ?? ''}
        `;
      }),
    ).rejects.toThrow(/append-only/);

    const [counts] = await admin.sql<{ events: string; messages: string }[]>`
      select
        (select count(*)::text from domain_events where user_id = ${scopeB.userId}) as events,
        (select count(*)::text from outbox_messages where user_id = ${scopeB.userId}) as messages
    `;
    expect(counts).toEqual({ events: '13', messages: '13' });
  });

  it('creates, edits, and undoes owner-scoped internal tasks and reminder intent', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const ids = new CryptoIdGenerator();
    const clock = { now: () => new Date('2026-07-19T08:00:00.000Z') };
    const actions = new ActionService({ clock, ids, transactions });
    const taskContext = { correlationId: ids.next() };
    const taskInput = {
      authority: {
        ambiguous: false,
        deterministic: true,
        explicit: true,
        externalEffect: false,
        ownerConfirmed: true,
      },
      dueAt: null,
      estimateMinutes: 30,
      goalResourceId: null,
      kind: 'task',
      notes: 'Owner entered detail',
      title: 'Owner entered task',
    } as const;
    const taskResult = await actions.createTask(scopeA, taskInput, taskContext);
    await expect(
      actions.createTask(scopeA, taskInput, taskContext),
    ).resolves.toMatchObject({
      receipt: { id: taskResult.receipt.id },
      target: { id: taskResult.target.id },
    });
    const otherOwnerActions = await actions.list(scopeB);
    expect(
      otherOwnerActions.tasks.some((task) => task.id === taskResult.target.id),
    ).toBe(false);
    await expect(
      actions.undo(
        scopeB,
        taskResult.receipt.id,
        taskResult.receipt.version,
        true,
        { correlationId: ids.next() },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const editedTask = await actions.editTask(
      scopeA,
      taskResult.receipt.id,
      {
        dueAt: '2026-07-20T10:00:00.000Z',
        estimateMinutes: 45,
        expectedReceiptVersion: taskResult.receipt.version,
        expectedTargetVersion: taskResult.target.version,
        kind: 'commitment',
        notes: 'Owner entered detail',
        ownerConfirmed: true,
        title: 'Edited owner task',
      },
      { correlationId: ids.next() },
    );
    expect(editedTask.target).toMatchObject({
      kind: 'commitment',
      state: 'scheduled',
      version: 2,
    });
    const undoneTask = await actions.undo(
      scopeA,
      taskResult.receipt.id,
      taskResult.receipt.version,
      true,
      { correlationId: ids.next() },
    );
    expect(undoneTask).toMatchObject({
      receipt: { status: 'undone', version: 2 },
      target: { state: 'dropped' },
    });

    const reminderResult = await actions.createReminderCommand(
      scopeA,
      {
        command: 'Remind me tomorrow at 15:00 to run a synthetic check',
        ownerConfirmed: true,
        timeZone: 'Africa/Johannesburg',
      },
      { correlationId: ids.next() },
    );
    expect(reminderResult.target).toMatchObject({
      deliveryPolicy: 'undecided',
      purpose: 'run a synthetic check',
      triggerAt: new Date('2026-07-20T13:00:00.000Z'),
    });
    const editedReminder = await actions.editReminder(
      scopeA,
      reminderResult.receipt.id,
      {
        expiresAt: null,
        expectedReceiptVersion: reminderResult.receipt.version,
        expectedTargetVersion: reminderResult.target.version,
        ownerConfirmed: true,
        priority: 'high',
        purpose: 'run the edited synthetic check',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          schemaVersion: 1,
          until: null,
          weekDays: [],
        },
        timeZone: 'Africa/Johannesburg',
        triggerAt: '2026-07-21T13:00:00.000Z',
      },
      { correlationId: ids.next() },
    );
    expect(editedReminder.target).toMatchObject({
      priority: 'high',
      version: 2,
    });
    await actions.undo(
      scopeA,
      reminderResult.receipt.id,
      reminderResult.receipt.version,
      true,
      { correlationId: ids.next() },
    );
    const [occurrences] = await admin.sql<
      { cancelled: string; pending: string }[]
    >`
      select
        count(*) filter (where state = 'cancelled')::text as cancelled,
        count(*) filter (where state = 'pending')::text as pending
      from reminder_occurrences
      where reminder_id = ${reminderResult.target.id}
    `;
    expect(occurrences).toEqual({ cancelled: '2', pending: '0' });
    const actionEvents = await transactions.run(scopeA, (ports) =>
      ports.domainEvents.listByTypePrefix(scopeA, 'action.', 20),
    );
    expect(actionEvents).toHaveLength(6);
    expect(JSON.stringify(actionEvents)).not.toContain('Owner entered');
    expect(JSON.stringify(actionEvents)).not.toContain('synthetic check');
  });

  it('builds owner-isolated local Today with three priorities and guarded lifecycle undo', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const ids = new CryptoIdGenerator();
    const clock = { now: () => new Date('2026-07-19T08:00:00.000Z') };
    const actions = new ActionService({ clock, ids, transactions });
    const today = new TodayService({ clock, ids, transactions });
    const createTask = (title: string) =>
      actions.createTask(
        scopeA,
        {
          authority: {
            ambiguous: false,
            deterministic: true,
            explicit: true,
            externalEffect: false,
            ownerConfirmed: true,
          },
          dueAt: null,
          estimateMinutes: null,
          goalResourceId: null,
          kind: 'task',
          notes: `private notes for ${title}`,
          title,
        },
        { correlationId: ids.next() },
      );
    const taskResults = await Promise.all([
      createTask('Today fixture one'),
      createTask('Today fixture two'),
      createTask('Today fixture three'),
      createTask('Today fixture four'),
    ]);
    for (const [index, task] of taskResults.slice(0, 3).entries()) {
      await today.selectPriority(
        scopeA,
        {
          localDate: '2026-07-19',
          ownerConfirmed: true,
          position: index + 1,
          taskId: task.target.id,
        },
        { correlationId: ids.next() },
      );
    }
    await expect(
      today.selectPriority(
        scopeA,
        {
          localDate: '2026-07-19',
          ownerConfirmed: true,
          position: 3,
          taskId: taskResults[3].target.id,
        },
        { correlationId: ids.next() },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const agenda = await today.createAgendaBlock(
      scopeA,
      {
        endsAt: '2026-07-19T11:00:00.000Z',
        notes: 'private agenda notes',
        ownerConfirmed: true,
        startsAt: '2026-07-19T10:00:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Today fixture agenda',
      },
      { correlationId: ids.next() },
    );
    const reminder = await actions.createReminder(
      scopeA,
      {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        expiresAt: null,
        priority: 'normal',
        purpose: 'Today fixture reminder',
        recurrence: null,
        relatedResourceId: null,
        timeZone: 'Africa/Johannesburg',
        triggerAt: '2026-07-19T09:00:00.000Z',
      },
      { correlationId: ids.next() },
    );

    const snapshot = await today.get(
      scopeA,
      '2026-07-19',
      'Africa/Johannesburg',
    );
    expect(snapshot.channel).toEqual({
      externalDeliveryActive: false,
      status: 'inactive',
    });
    expect(snapshot.priorities).toHaveLength(3);
    expect(snapshot.agendaBlocks).toContainEqual(
      expect.objectContaining({ id: agenda.id }),
    );
    expect(
      snapshot.reminders.some(
        (item) => item.reminder.id === reminder.target.id,
      ),
    ).toBe(true);
    await expect(
      today.get(scopeB, '2026-07-19', 'Africa/Johannesburg'),
    ).resolves.toMatchObject({
      agendaBlocks: [],
      priorities: [],
    });

    const task = taskResults[0];
    const taskReceipt = await today.completeTask(
      scopeA,
      task.target.id,
      task.target.version,
      true,
      { correlationId: ids.next() },
    );
    const undoneTaskReceipt = await today.undo(
      scopeA,
      taskReceipt.id,
      taskReceipt.version,
      true,
      { correlationId: ids.next() },
    );
    expect(undoneTaskReceipt.status).toBe('undone');
    await expect(
      transactions.run(scopeA, (ports) =>
        ports.tasks.findById(scopeA, task.target.id),
      ),
    ).resolves.toMatchObject({ state: 'open', version: 3 });

    const reminderReceipt = await today.dismissReminder(
      scopeA,
      reminder.target.id,
      reminder.target.version,
      true,
      { correlationId: ids.next() },
    );
    await today.undo(
      scopeA,
      reminderReceipt.id,
      reminderReceipt.version,
      true,
      { correlationId: ids.next() },
    );
    await expect(
      transactions.run(scopeA, (ports) =>
        ports.reminders.findById(scopeA, reminder.target.id),
      ),
    ).resolves.toMatchObject({ state: 'scheduled', version: 3 });

    const todayEvents = await transactions.run(scopeA, (ports) =>
      ports.domainEvents.listByTypePrefix(scopeA, 'today.', 30),
    );
    expect(todayEvents.length).toBeGreaterThanOrEqual(8);
    const eventText = JSON.stringify(todayEvents);
    expect(eventText).not.toContain('Today fixture');
    expect(eventText).not.toContain('private agenda notes');
    expect(eventText).not.toContain('private notes');
  });

  it('keeps goals, dependencies, and soft load guidance local and owner-controlled', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const ids = new CryptoIdGenerator();
    const clock = { now: () => new Date('2026-07-23T10:00:00.000Z') };
    const goals = new GoalService({ clock, ids, transactions });
    const created = [];
    for (let index = 1; index <= 6; index += 1) {
      created.push(
        await goals.create(
          scopeA,
          {
            lifeDomain: 'Synthetic domain',
            narrative: `Private goal narrative ${String(index)}`,
            ownerConfirmed: true,
            successCriteria: `Private success criterion ${String(index)}`,
            targetDate: index % 2 === 0 ? '2026-12-31' : null,
            title: `Private goal title ${String(index)}`,
            type: index % 2 === 0 ? 'behavioural' : 'outcome',
          },
          { correlationId: ids.next() },
        ),
      );
    }

    const activated = [];
    for (const goal of created.slice(0, 5)) {
      activated.push(
        await goals.transition(
          scopeA,
          goal.id,
          {
            acknowledgeActiveLimit: false,
            expectedVersion: goal.version,
            mergedIntoGoalId: null,
            nextState: 'active',
            ownerConfirmed: true,
          },
          { correlationId: ids.next() },
        ),
      );
    }
    const sixthCreated = created[5];
    const firstActivated = activated[0];
    if (!sixthCreated || !firstActivated)
      throw new Error('Goal activation fixtures were not created.');
    await expect(
      goals.transition(
        scopeA,
        sixthCreated.id,
        {
          acknowledgeActiveLimit: false,
          expectedVersion: sixthCreated.version,
          mergedIntoGoalId: null,
          nextState: 'active',
          ownerConfirmed: true,
        },
        { correlationId: ids.next() },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { activeCount: 5, limit: 5, requiresAcknowledgement: true },
    });
    const sixth = await goals.transition(
      scopeA,
      sixthCreated.id,
      {
        acknowledgeActiveLimit: true,
        expectedVersion: sixthCreated.version,
        mergedIntoGoalId: null,
        nextState: 'active',
        ownerConfirmed: true,
      },
      { correlationId: ids.next() },
    );

    const dependency = await goals.createEdge(
      scopeA,
      {
        edgeType: 'depends_on',
        ownerConfirmed: true,
        sourceResourceId: sixth.resourceId,
        targetResourceId: firstActivated.resourceId,
      },
      { correlationId: ids.next() },
    );
    await expect(
      goals.createEdge(
        scopeA,
        {
          edgeType: 'depends_on',
          ownerConfirmed: true,
          sourceResourceId: firstActivated.resourceId,
          targetResourceId: sixth.resourceId,
        },
        { correlationId: ids.next() },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      goals.removeEdge(scopeB, dependency.id, dependency.version, true, {
        correlationId: ids.next(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const actions = new ActionService({ clock, ids, transactions });
    const linked = await actions.createTask(
      scopeA,
      {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        dueAt: null,
        estimateMinutes: 30,
        goalResourceId: sixth.resourceId,
        kind: 'milestone',
        notes: 'Private linked-task notes',
        title: 'Private linked-task title',
      },
      { correlationId: ids.next() },
    );

    const overLimit = await goals.get(scopeA);
    expect(overLimit.guidance).toEqual({
      activeCount: 6,
      limit: 5,
      overBy: 1,
      requiresAcknowledgement: true,
      status: 'over_limit',
    });
    expect(overLimit.linkedTasks).toContainEqual(
      expect.objectContaining({ id: linked.target.id }),
    );
    expect(overLimit.blockers).toContainEqual({
      blockingResourceIds: [firstActivated.resourceId],
      goalResourceId: sixth.resourceId,
    });
    await expect(goals.get(scopeB)).resolves.toMatchObject({
      blockers: [],
      edges: [],
      goals: [],
    });

    await goals.transition(
      scopeA,
      firstActivated.id,
      {
        acknowledgeActiveLimit: false,
        expectedVersion: firstActivated.version,
        mergedIntoGoalId: null,
        nextState: 'completed',
        ownerConfirmed: true,
      },
      { correlationId: ids.next() },
    );
    expect((await goals.get(scopeA)).blockers).not.toContainEqual(
      expect.objectContaining({ goalResourceId: sixth.resourceId }),
    );

    const updatedOwner = await goals.updateSoftLimit(
      scopeA,
      { ownerConfirmed: true, softActiveGoalLimit: 3 },
      { correlationId: ids.next() },
    );
    expect(updatedOwner.softActiveGoalLimit).toBe(3);
    expect((await goals.get(scopeA)).guidance).toMatchObject({
      activeCount: 5,
      limit: 3,
      overBy: 2,
      status: 'over_limit',
    });

    const concurrentGoals = await Promise.all(
      ['Concurrent edge A', 'Concurrent edge B'].map((title) =>
        goals.create(
          scopeA,
          {
            lifeDomain: 'Synthetic domain',
            narrative: '',
            ownerConfirmed: true,
            successCriteria: '',
            targetDate: null,
            title,
            type: 'outcome',
          },
          { correlationId: ids.next() },
        ),
      ),
    );
    const concurrentA = concurrentGoals[0];
    const concurrentB = concurrentGoals[1];
    if (!concurrentA || !concurrentB)
      throw new Error('Concurrent edge fixtures were not created.');
    const concurrentEdges = await Promise.allSettled([
      goals.createEdge(
        scopeA,
        {
          edgeType: 'depends_on',
          ownerConfirmed: true,
          sourceResourceId: concurrentA.resourceId,
          targetResourceId: concurrentB.resourceId,
        },
        { correlationId: ids.next() },
      ),
      goals.createEdge(
        scopeA,
        {
          edgeType: 'depends_on',
          ownerConfirmed: true,
          sourceResourceId: concurrentB.resourceId,
          targetResourceId: concurrentA.resourceId,
        },
        { correlationId: ids.next() },
      ),
    ]);
    expect(
      concurrentEdges.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrentEdges.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const goalEvents = await transactions.run(scopeA, (ports) =>
      ports.domainEvents.listByTypePrefix(scopeA, 'goal.', 40),
    );
    const eventText = JSON.stringify(goalEvents);
    expect(goalEvents.length).toBeGreaterThanOrEqual(15);
    expect(eventText).not.toContain('Private goal');
    expect(eventText).not.toContain('Private success');
    expect(eventText).not.toContain('Private linked');
    expect(eventText).not.toContain('Synthetic domain');
  });

  it('cascades revision-derived provenance when an entry is deleted', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const revision: EntryRevisionRecord = {
      bodyMarkdown: 'Source evidence',
      bodyRaw: null,
      changeKind: 'content',
      contentHash:
        'ea18d9b5b14ad08bd342d86c977d79c9c678b555f2ccc981ec9b72c02f3232f7',
      createdAt: now,
      createdBy: 'user',
      entryId,
      id: revisionId,
      occurredAt: now,
      processingClass: 'private',
      revisionNumber: 1,
      scope: scopeA,
    };
    const link: DerivationLinkRecord = {
      assertionClass: 'explicit_statement',
      confidence: null,
      createdAt: now,
      derivedResourceId: resourceId,
      id: linkId,
      invalidatedAt: null,
      invalidationReason: null,
      relation: 'derived_from',
      scope: scopeA,
      sourceResourceId: null,
      sourceRevisionId: revisionId,
      sourceSpanEnd: 15,
      sourceSpanStart: 0,
    };

    await transactions.run(scopeA, async (ports) => {
      await ports.entryRevisions.append(revision);
      const savedEntry = await ports.entries.findById(scopeA, entryId);
      if (!savedEntry) throw new Error('Entry fixture was not found.');
      await ports.entries.save({
        ...savedEntry,
        currentRevisionId: revisionId,
      });
      await ports.derivationLinks.append(link);
    });

    await app.sql.begin(async (sql) => {
      await sql`select set_config('meridian.user_id', ${scopeA.userId}, true)`;
      await sql`delete from entries where id = ${entryId}`;
    });
    await expect(
      transactions.run(scopeA, async (ports) =>
        ports.derivationLinks.findForDerivedResource(scopeA, resourceId),
      ),
    ).resolves.toHaveLength(0);
  });

  it('claims concurrent outbox dispatch exactly once in the queue transaction', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const installer = new PgBoss(adminUrl);
    await installer.start();
    await ensureWorkerQueues(installer);
    await admin.sql.unsafe(`grant usage on schema pgboss to ${appRole}`);
    await admin.sql.unsafe(
      `grant select, insert, update, delete on all tables in schema pgboss to ${appRole}`,
    );
    await admin.sql.unsafe(
      `grant usage, select, update on all sequences in schema pgboss to ${appRole}`,
    );
    await admin.sql.unsafe(
      `grant execute on all functions in schema pgboss to ${appRole}`,
    );
    const dispatcher = new DrizzlePgBossOutboxDispatchGateway(
      app.sql,
      installer,
      OUTBOX_QUEUE_V1,
    );
    try {
      const batches = await Promise.all([
        dispatcher.dispatchAvailable(scopeB, new Date(), 20),
        dispatcher.dispatchAvailable(scopeB, new Date(), 20),
      ]);
      const jobs = batches.flat();
      expect(jobs).toHaveLength(13);
      expect(new Set(jobs.map((job) => job.outboxMessageId)).size).toBe(13);
      expect(
        await installer.findJobs(OUTBOX_QUEUE_V1, { queued: true }),
      ).toHaveLength(13);
    } finally {
      await installer.stop();
    }
  });

  it('processes pg-boss work and dead-letters after bounded retries', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const boss = new PgBoss(adminUrl);
    const observations: unknown[] = [];
    const controlledCode = workerErrorCodeV1Schema.parse(
      'CONTROLLED_INTEGRATION_FAILURE',
    );
    const service = new ReliableEventService({
      clock: { now: () => new Date() },
      consumer: {
        handle: (event) =>
          event.eventType === 'journal.entry_privacy_changed.v1'
            ? Promise.reject(new EventHandlingError(controlledCode, true))
            : Promise.resolve(),
      },
      dispatcher: new DrizzlePgBossOutboxDispatchGateway(
        app.sql,
        boss,
        OUTBOX_QUEUE_V1,
      ),
      observations: {
        observe: (observation) => observations.push(observation),
      },
      outbox: new DrizzleWorkerOutboxRepository(app.database),
    });
    const runtime = new MeridianWorkerRuntime({
      boss,
      closeDatabase: () => Promise.resolve(),
      events: service,
      observations: {
        observe: (observation) => observations.push(observation),
      },
      scope: scopeB,
    });

    try {
      await runtime.start();
      const deadline = Date.now() + 15_000;
      let health = await new DrizzleTransactionManager(app.database).run(
        scopeB,
        (ports) => ports.outbox.health(scopeB, 20),
      );
      while (
        (health.inFlight > 0 || health.pending > 0) &&
        Date.now() < deadline
      ) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 200));
        health = await new DrizzleTransactionManager(app.database).run(
          scopeB,
          (ports) => ports.outbox.health(scopeB, 20),
        );
      }
      expect(health).toMatchObject({
        failed: 1,
        inFlight: 0,
        pending: 0,
        succeeded: 12,
        uncertain: 0,
      });
      expect(health.deadLetters[0]).toMatchObject({
        attempts: 3,
        errorCode: controlledCode,
        eventType: 'journal.entry_privacy_changed.v1',
      });
      const deadJobs = await boss.findJobs('meridian.outbox.dead.v1', {
        queued: true,
      });
      expect(deadJobs).toHaveLength(1);
      expect(deadJobs[0]?.sourceId).toBe(
        health.deadLetters[0]?.outboxMessageId,
      );
      expect(JSON.stringify(observations)).not.toContain(
        'This remains local display only.',
      );
    } finally {
      await runtime.stop();
    }
  }, 30_000);

  it('stores an exact-scope Microsoft connection encrypted, refreshes it, and disconnects without affecting local ownership', async () => {
    if (!app) throw new Error('Application database was not initialized.');
    const transactions = new DrizzleTransactionManager(app.database);
    const ids = new CryptoIdGenerator();
    const secrets = new NodeSecretService();
    const cipher = new Aes256GcmTokenCipher(
      Buffer.alloc(32, 7).toString('base64'),
    );
    let currentTime = new Date('2026-07-18T09:00:00.000Z');
    let exchangedVerifier = '';
    let refreshCount = 0;
    let consentRevoked = false;
    const gateway: MicrosoftOAuthGateway = {
      authorizationUrl(request) {
        const url = new URL(
          'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
        );
        url.search = new URLSearchParams({
          client_id: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
          code_challenge: request.codeChallenge,
          code_challenge_method: 'S256',
          redirect_uri: request.redirectUri,
          response_type: 'code',
          scope: request.scopes.join(' '),
          state: request.state,
        }).toString();
        return url;
      },
      exchangeAuthorizationCode(code, codeVerifier, redirectUri) {
        expect(code).toBe('one-time-code');
        expect(redirectUri).toBe(
          'http://localhost:3000/api/integrations/microsoft/callback',
        );
        exchangedVerifier = codeVerifier;
        return Promise.resolve({
          accessToken: 'initial-access-token',
          expiresInSeconds: 60,
          grantedScopes: MICROSOFT_STAGE_A_SCOPES,
          refreshToken: 'initial-refresh-token',
        });
      },
      readProfile(accessToken) {
        expect(accessToken).toBe('initial-access-token');
        return Promise.resolve({
          displayName: 'Meridian Test Owner',
          providerSubjectId: 'provider-subject-opaque',
        });
      },
      refresh(refreshToken) {
        expect(refreshToken).toBe('initial-refresh-token');
        if (consentRevoked)
          return Promise.reject(
            new MicrosoftOAuthGatewayError('consent_revoked'),
          );
        refreshCount += 1;
        return Promise.resolve({
          accessToken: 'rotated-access-token',
          expiresInSeconds: 3600,
          grantedScopes: MICROSOFT_STAGE_A_SCOPES,
          refreshToken: 'rotated-refresh-token',
        });
      },
    };
    const microsoft = new MicrosoftConnectionService({
      authorization: {
        cipher,
        gateway,
        pkce: new NodePkceGenerator(),
        redirectUri:
          'http://localhost:3000/api/integrations/microsoft/callback',
      },
      clock: { now: () => currentTime },
      ids,
      oauthSessions: new DrizzleOAuthAuthorizationSessionStore(app.database),
      secrets,
      transactions,
    });

    const authorizationUrl = await microsoft.beginConnection(scopeA);
    expect(authorizationUrl.hostname).toBe('login.microsoftonline.com');
    expect(authorizationUrl.pathname).toContain('/consumers/');
    expect(authorizationUrl.searchParams.get('scope')?.split(' ')).toEqual(
      MICROSOFT_STAGE_A_SCOPES,
    );
    expect(authorizationUrl.search).not.toMatch(
      /ReadWrite|Mail|Tasks|Shared|\.default/i,
    );
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
      'S256',
    );
    const state = authorizationUrl.searchParams.get('state');
    if (!state) throw new Error('Authorization state was not generated.');
    const [pendingFlow] = await admin.sql<
      { code_verifier_ciphertext: string; state_hash: string }[]
    >`
      select code_verifier_ciphertext, state_hash
      from oauth_authorization_sessions
      where user_id = ${scopeA.userId}
      order by created_at desc
      limit 1
    `;
    expect(pendingFlow?.state_hash).toBe(secrets.hash(state));
    expect(pendingFlow?.state_hash).not.toContain(state);
    expect(pendingFlow?.code_verifier_ciphertext).toMatch(/^v1\./);

    await microsoft.completeConnection(state, 'one-time-code');
    expect(exchangedVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(pendingFlow?.code_verifier_ciphertext).not.toContain(
      exchangedVerifier,
    );
    const [consumedFlow] = await admin.sql<
      { code_verifier_ciphertext: string; consumed_at: Date | null }[]
    >`
      select code_verifier_ciphertext, consumed_at
      from oauth_authorization_sessions
      where state_hash = ${secrets.hash(state)}
    `;
    expect(consumedFlow?.code_verifier_ciphertext).toBe('v1.consumed');
    expect(consumedFlow?.consumed_at).not.toBeNull();
    expect(new Date(consumedFlow?.consumed_at ?? 0).toISOString()).toBe(
      currentTime.toISOString(),
    );
    await expect(
      microsoft.completeConnection(state, 'one-time-code'),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });

    const connected = await microsoft.status(scopeA);
    expect(connected).toMatchObject({
      account: {
        displayName: 'Meridian Test Owner',
        grantedScopes: MICROSOFT_STAGE_A_SCOPES,
        status: 'connected',
      },
      configured: true,
    });
    expect(connected.consentRecords).toHaveLength(1);
    expect(await microsoft.status(scopeB)).toMatchObject({ account: null });

    const [storedTokens] = await admin.sql<
      {
        access_token_ciphertext: string;
        refresh_token_ciphertext: string;
      }[]
    >`
      select access_token_ciphertext, refresh_token_ciphertext
      from integration_accounts
      where user_id = ${scopeA.userId}
    `;
    expect(storedTokens?.access_token_ciphertext).toMatch(/^v1\./);
    expect(storedTokens?.refresh_token_ciphertext).toMatch(/^v1\./);
    expect(JSON.stringify(storedTokens)).not.toContain('initial-access-token');
    expect(JSON.stringify(storedTokens)).not.toContain('initial-refresh-token');
    await expect(
      app.sql.begin(async (sql) => {
        await sql`select set_config('meridian.user_id', ${scopeA.userId}, true)`;
        await sql`
          update integration_accounts
          set granted_scopes = ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Read']::text[]
          where user_id = ${scopeA.userId}
        `;
      }),
    ).rejects.toThrow(/integration_accounts_stage_a_scopes/);

    currentTime = new Date('2026-07-18T09:01:00.000Z');
    await expect(microsoft.accessTokenFor(scopeA)).resolves.toBe(
      'rotated-access-token',
    );
    expect(refreshCount).toBe(1);
    const refreshed = await microsoft.status(scopeA);
    expect(refreshed.account?.lastRefreshedAt).toEqual(currentTime);

    await microsoft.disconnect(scopeA, 'DISCONNECT', {
      correlationId: ids.next(),
    });
    const disconnected = await microsoft.status(scopeA);
    expect(disconnected.account?.status).toBe('disconnected');
    expect(disconnected.consentRecords.map((record) => record.action)).toEqual([
      'disconnected',
      'granted',
    ]);
    const [cleared] = await admin.sql<
      {
        access_token_ciphertext: string | null;
        refresh_token_ciphertext: string | null;
        status: string;
      }[]
    >`
      select access_token_ciphertext, refresh_token_ciphertext, status
      from integration_accounts
      where user_id = ${scopeA.userId}
    `;
    expect(cleared).toEqual({
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      status: 'disconnected',
    });
    await expect(
      app.sql.begin(async (sql) => {
        await sql`select set_config('meridian.user_id', ${scopeA.userId}, true)`;
        await sql`
          update consent_records set action = 'granted'
          where user_id = ${scopeA.userId}
        `;
      }),
    ).rejects.toThrow(/append-only/);

    currentTime = new Date('2026-07-18T09:02:00.000Z');
    const reconnectUrl = await microsoft.beginConnection(scopeA);
    const reconnectState = reconnectUrl.searchParams.get('state');
    if (!reconnectState) throw new Error('Reconnect state was not generated.');
    await microsoft.completeConnection(reconnectState, 'one-time-code');
    consentRevoked = true;
    currentTime = new Date('2026-07-18T09:03:00.000Z');
    await expect(microsoft.accessTokenFor(scopeA)).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
    });
    const reauthorization = await microsoft.status(scopeA);
    expect(reauthorization.account?.status).toBe('reauthorization_required');
    const [revokedTokens] = await admin.sql<
      {
        access_token_ciphertext: string | null;
        refresh_token_ciphertext: string | null;
      }[]
    >`
      select access_token_ciphertext, refresh_token_ciphertext
      from integration_accounts
      where user_id = ${scopeA.userId}
    `;
    expect(revokedTokens).toEqual({
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
    });
    const [events] = await admin.sql<{ count: string }[]>`
      select count(*)::text as count
      from domain_events
      where user_id = ${scopeA.userId}
        and event_type like 'integration.%'
    `;
    const [messages] = await admin.sql<{ count: string }[]>`
      select count(*)::text as count
      from outbox_messages
      where user_id = ${scopeA.userId}
        and topic like 'integration.%'
    `;
    expect(events?.count).toBe('4');
    expect(messages?.count).toBe('4');
  });
});
