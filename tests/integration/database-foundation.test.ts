import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  DerivationLinkRecord,
  EntryRecord,
  EntryRevisionRecord,
  ResourceRecord,
  UserRecord,
  UserScope,
} from '../../packages/domain/src/index.js';
import {
  derivationLinkIdV1Schema,
  entryIdV1Schema,
  entryRevisionIdV1Schema,
  resourceIdV1Schema,
  userIdV1Schema,
} from '../../packages/domain/src/index.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../../packages/infrastructure-db/src/client.js';
import { DrizzleTransactionManager } from '../../packages/infrastructure-db/src/transaction-manager.js';
import {
  JournalService,
  type MaterialChangeInvalidation,
  type MaterialChangeInvalidationHook,
} from '../../packages/application/src/journal.js';
import {
  CryptoIdGenerator,
  NodeSecretService,
  SystemClock,
} from '../../packages/infrastructure-auth/src/index.js';

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
      'auth_credentials',
      'auth_events',
      'auth_rate_limits',
      'auth_sessions',
      'derivation_links',
      'domain_events',
      'entries',
      'entry_revisions',
      'outbox_messages',
      'recovery_codes',
      'resources',
      'schema_registry',
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
    await admin.sql.unsafe(`grant select on schema_registry to ${appRole}`);
    await admin.sql.unsafe(
      `grant select, insert, update, delete on users, resources, entries, entry_revisions, derivation_links, domain_events, outbox_messages to ${appRole}`,
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
    const invalidations: MaterialChangeInvalidation[] = [];
    const invalidation: MaterialChangeInvalidationHook = {
      invalidate(change) {
        invalidations.push(change);
        return Promise.resolve();
      },
    };
    const journal = new JournalService({
      clock: new SystemClock(),
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
    expect(invalidations).toHaveLength(2);
    expect(invalidations[1]?.changeKind).toBe('privacy');

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
    expect(counts).toEqual({ events: '5', messages: '5' });
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
});
