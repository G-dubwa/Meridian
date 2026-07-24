import {
  contextEvidenceLaneV1Schema,
  contextManifestIdV1Schema,
  contextManifestPurposeV1Schema,
  entryRevisionIdV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeLocatorV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  resourceIdV1Schema,
  retrievalMethodV1Schema,
  retrievalSourceKindV1Schema,
} from '@meridian/domain';
import type {
  ContextManifestRecord,
  ContextManifestRepository,
  EmbeddingResult,
  RetrievalCandidateRecord,
  RetrievalEmbeddingRecord,
  RetrievalEmbeddingRepository,
  RetrievalSearchRepository,
  UserScope,
} from '@meridian/domain';
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import {
  contextManifestItems,
  contextManifests,
  entries,
  entryRevisions,
  knowledgeChunks,
  knowledgeSourceRevisions,
  knowledgeSources,
  retrievalEmbeddings,
} from './schema.js';

interface CandidateRow {
  contentHash: string;
  entryRevisionId: string | null;
  knowledgeChunkId: string | null;
  knowledgeSourceRevisionId: string | null;
  locator: unknown;
  occurredAt: Date;
  resourceId: string;
  score: number;
  text: string;
  title: string;
}

function mapCandidate(
  row: CandidateRow,
  lane: 'personal_evidence' | 'external_evidence',
  method: 'full_text' | 'semantic',
): RetrievalCandidateRecord {
  return {
    contentHash: row.contentHash,
    entryRevisionId:
      row.entryRevisionId === null
        ? null
        : entryRevisionIdV1Schema.parse(row.entryRevisionId),
    evidenceLane: lane,
    knowledgeChunkId:
      row.knowledgeChunkId === null
        ? null
        : knowledgeChunkIdV1Schema.parse(row.knowledgeChunkId),
    knowledgeSourceRevisionId:
      row.knowledgeSourceRevisionId === null
        ? null
        : knowledgeSourceRevisionIdV1Schema.parse(
            row.knowledgeSourceRevisionId,
          ),
    locator:
      row.locator === null ? null : knowledgeLocatorV1Schema.parse(row.locator),
    methods: [method],
    occurredAt: row.occurredAt,
    resourceId: resourceIdV1Schema.parse(row.resourceId),
    score: Math.max(0, Math.min(1, row.score)),
    sourceKind:
      lane === 'personal_evidence' ? 'entry_revision' : 'knowledge_chunk',
    text: row.text,
    title: row.title,
  };
}

function mergeCandidates(
  lexical: readonly RetrievalCandidateRecord[],
  semantic: readonly RetrievalCandidateRecord[],
  limit: number,
): readonly RetrievalCandidateRecord[] {
  const bySource = new Map<string, RetrievalCandidateRecord>();
  for (const candidate of [...lexical, ...semantic]) {
    const key = candidate.entryRevisionId
      ? `entry:${candidate.entryRevisionId}`
      : `chunk:${String(candidate.knowledgeChunkId)}`;
    const current = bySource.get(key);
    if (!current) {
      bySource.set(key, candidate);
      continue;
    }
    const methods = [
      ...new Set([...current.methods, ...candidate.methods]),
    ].map((method) => retrievalMethodV1Schema.parse(method));
    const lexicalScore =
      current.methods.includes('full_text') ||
      candidate.methods.includes('full_text')
        ? current.methods.includes('full_text')
          ? current.score
          : candidate.score
        : 0;
    const semanticScore =
      current.methods.includes('semantic') ||
      candidate.methods.includes('semantic')
        ? current.methods.includes('semantic')
          ? current.score
          : candidate.score
        : 0;
    bySource.set(key, {
      ...current,
      methods,
      score:
        methods.length === 2
          ? lexicalScore * 0.55 + semanticScore * 0.45
          : Math.max(current.score, candidate.score),
    });
  }
  return [...bySource.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
    .slice(0, limit);
}

export class DrizzleRetrievalSearchRepository implements RetrievalSearchRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async searchPersonal(
    scope: UserScope,
    query: string,
    limit: number,
    queryEmbedding?: EmbeddingResult,
  ): Promise<readonly RetrievalCandidateRecord[]> {
    const textVector = sql`to_tsvector('simple', ${entryRevisions.bodyMarkdown})`;
    const searchQuery = sql`websearch_to_tsquery('simple', ${query})`;
    const rank = sql<number>`least(1.0, ts_rank_cd(${textVector}, ${searchQuery}) * 4.0)`;
    const lexicalRows = await this.database
      .select({
        contentHash: entryRevisions.contentHash,
        entryRevisionId: entryRevisions.id,
        knowledgeChunkId: sql<null>`null`,
        knowledgeSourceRevisionId: sql<null>`null`,
        locator: sql<null>`null`,
        occurredAt: entryRevisions.occurredAt,
        resourceId: entries.id,
        score: rank,
        text: entryRevisions.bodyMarkdown,
        title: sql<string>`'Journal entry'`,
      })
      .from(entryRevisions)
      .innerJoin(
        entries,
        and(
          eq(entries.id, entryRevisions.entryId),
          eq(entries.userId, entryRevisions.userId),
          eq(entries.currentRevisionId, entryRevisions.id),
        ),
      )
      .where(
        and(
          eq(entryRevisions.userId, scope.userId),
          eq(entryRevisions.processingClass, 'standard'),
          eq(entries.status, 'active'),
          sql`${textVector} @@ ${searchQuery}`,
        ),
      )
      .orderBy(desc(rank), desc(entryRevisions.occurredAt))
      .limit(limit);
    const lexical = lexicalRows.map((row) =>
      mapCandidate(row, 'personal_evidence', 'full_text'),
    );
    if (!queryEmbedding) return lexical;

    const similarity = sql<number>`greatest(0.0, least(1.0, 1.0 - (${cosineDistance(
      retrievalEmbeddings.embedding,
      [...queryEmbedding.vector],
    )})))`;
    const semanticRows = await this.database
      .select({
        contentHash: entryRevisions.contentHash,
        entryRevisionId: entryRevisions.id,
        knowledgeChunkId: sql<null>`null`,
        knowledgeSourceRevisionId: sql<null>`null`,
        locator: sql<null>`null`,
        occurredAt: entryRevisions.occurredAt,
        resourceId: entries.id,
        score: similarity,
        text: entryRevisions.bodyMarkdown,
        title: sql<string>`'Journal entry'`,
      })
      .from(retrievalEmbeddings)
      .innerJoin(
        entryRevisions,
        and(
          eq(retrievalEmbeddings.entryRevisionId, entryRevisions.id),
          eq(retrievalEmbeddings.userId, entryRevisions.userId),
        ),
      )
      .innerJoin(
        entries,
        and(
          eq(entries.id, entryRevisions.entryId),
          eq(entries.userId, entryRevisions.userId),
          eq(entries.currentRevisionId, entryRevisions.id),
        ),
      )
      .where(
        and(
          eq(retrievalEmbeddings.userId, scope.userId),
          eq(retrievalEmbeddings.lane, 'personal'),
          eq(retrievalEmbeddings.modelId, queryEmbedding.modelId),
          eq(retrievalEmbeddings.modelVersion, queryEmbedding.modelVersion),
          eq(retrievalEmbeddings.dimensions, queryEmbedding.dimensions),
          eq(entryRevisions.processingClass, 'standard'),
          eq(entries.status, 'active'),
        ),
      )
      .orderBy(desc(similarity), desc(entryRevisions.occurredAt))
      .limit(limit);
    return mergeCandidates(
      lexical,
      semanticRows.map((row) =>
        mapCandidate(row, 'personal_evidence', 'semantic'),
      ),
      limit,
    );
  }

  public async searchExternal(
    scope: UserScope,
    query: string,
    limit: number,
    queryEmbedding?: EmbeddingResult,
  ): Promise<readonly RetrievalCandidateRecord[]> {
    const chunkVector = sql`to_tsvector('simple', ${knowledgeChunks.text})`;
    const titleVector = sql`to_tsvector('simple', ${knowledgeSources.title})`;
    const searchQuery = sql`websearch_to_tsquery('simple', ${query})`;
    const rank = sql<number>`least(1.0, ts_rank_cd(${chunkVector}, ${searchQuery}) * 3.5 + ts_rank_cd(${titleVector}, ${searchQuery}) * 1.5)`;
    const eligibility = and(
      eq(knowledgeChunks.userId, scope.userId),
      eq(knowledgeSourceRevisions.processingClass, 'standard'),
      inArray(knowledgeSourceRevisions.extractionQuality, [
        'complete',
        'partial',
      ]),
      inArray(knowledgeSources.reviewStatus, ['reviewed', 'reference_only']),
      inArray(knowledgeSources.correctionStatus, [
        'unknown',
        'none_known',
        'corrected',
      ]),
      isNull(knowledgeSources.deletionRequestedAt),
      sql`not exists (
        select 1 from knowledge_source_revisions newer
        where newer.user_id = ${knowledgeSourceRevisions.userId}
          and newer.knowledge_source_id = ${knowledgeSourceRevisions.knowledgeSourceId}
          and newer.revision_number > ${knowledgeSourceRevisions.revisionNumber}
      )`,
    );
    const baseSelection = {
      contentHash: knowledgeChunks.contentHash,
      entryRevisionId: sql<null>`null`,
      knowledgeChunkId: knowledgeChunks.id,
      knowledgeSourceRevisionId: knowledgeSourceRevisions.id,
      locator: knowledgeChunks.locator,
      occurredAt: knowledgeSourceRevisions.createdAt,
      resourceId: knowledgeSources.id,
      text: knowledgeChunks.text,
      title: knowledgeSources.title,
    };
    const lexicalRows = await this.database
      .select({ ...baseSelection, score: rank })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeSourceRevisions,
        and(
          eq(knowledgeSourceRevisions.id, knowledgeChunks.sourceRevisionId),
          eq(knowledgeSourceRevisions.userId, knowledgeChunks.userId),
        ),
      )
      .innerJoin(
        knowledgeSources,
        and(
          eq(knowledgeSources.id, knowledgeSourceRevisions.knowledgeSourceId),
          eq(knowledgeSources.userId, knowledgeSourceRevisions.userId),
        ),
      )
      .where(
        and(
          eligibility,
          sql`(${chunkVector} @@ ${searchQuery} or ${titleVector} @@ ${searchQuery})`,
        ),
      )
      .orderBy(desc(rank), desc(knowledgeSourceRevisions.createdAt))
      .limit(limit);
    const lexical = lexicalRows.map((row) =>
      mapCandidate(row, 'external_evidence', 'full_text'),
    );
    if (!queryEmbedding) return lexical;

    const similarity = sql<number>`greatest(0.0, least(1.0, 1.0 - (${cosineDistance(
      retrievalEmbeddings.embedding,
      [...queryEmbedding.vector],
    )})))`;
    const semanticRows = await this.database
      .select({ ...baseSelection, score: similarity })
      .from(retrievalEmbeddings)
      .innerJoin(
        knowledgeChunks,
        and(
          eq(retrievalEmbeddings.knowledgeChunkId, knowledgeChunks.id),
          eq(retrievalEmbeddings.userId, knowledgeChunks.userId),
        ),
      )
      .innerJoin(
        knowledgeSourceRevisions,
        and(
          eq(knowledgeSourceRevisions.id, knowledgeChunks.sourceRevisionId),
          eq(knowledgeSourceRevisions.userId, knowledgeChunks.userId),
        ),
      )
      .innerJoin(
        knowledgeSources,
        and(
          eq(knowledgeSources.id, knowledgeSourceRevisions.knowledgeSourceId),
          eq(knowledgeSources.userId, knowledgeSourceRevisions.userId),
        ),
      )
      .where(
        and(
          eligibility,
          eq(retrievalEmbeddings.lane, 'external'),
          eq(retrievalEmbeddings.modelId, queryEmbedding.modelId),
          eq(retrievalEmbeddings.modelVersion, queryEmbedding.modelVersion),
          eq(retrievalEmbeddings.dimensions, queryEmbedding.dimensions),
        ),
      )
      .orderBy(desc(similarity), desc(knowledgeSourceRevisions.createdAt))
      .limit(limit);
    return mergeCandidates(
      lexical,
      semanticRows.map((row) =>
        mapCandidate(row, 'external_evidence', 'semantic'),
      ),
      limit,
    );
  }
}

export class DrizzleContextManifestRepository implements ContextManifestRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async save(manifest: ContextManifestRecord): Promise<void> {
    await this.database.insert(contextManifests).values({
      createdAt: manifest.createdAt,
      id: manifest.id,
      policyVersion: manifest.policyVersion,
      purpose: manifest.purpose,
      semanticRetrievalActive: manifest.semanticRetrievalActive,
      userId: manifest.scope.userId,
    });
    if (manifest.items.length > 0)
      await this.database.insert(contextManifestItems).values(
        manifest.items.map((item) => ({
          contentHash: item.contentHash,
          entryRevisionId: item.entryRevisionId,
          evidenceLane: item.evidenceLane,
          knowledgeChunkId: item.knowledgeChunkId,
          knowledgeSourceRevisionId: item.knowledgeSourceRevisionId,
          manifestId: item.manifestId,
          methods: [...item.methods],
          ordinal: item.ordinal,
          policyReference: item.policyReference,
          resourceId: item.resourceId,
          score: item.score === null ? null : item.score.toFixed(8),
          sourceKind: item.sourceKind,
          userId: manifest.scope.userId,
        })),
      );
  }

  public async findById(
    scope: UserScope,
    id: ContextManifestRecord['id'],
  ): Promise<ContextManifestRecord | null> {
    const [manifest] = await this.database
      .select()
      .from(contextManifests)
      .where(
        and(
          eq(contextManifests.userId, scope.userId),
          eq(contextManifests.id, id),
        ),
      )
      .limit(1);
    if (!manifest) return null;
    const items = await this.database
      .select()
      .from(contextManifestItems)
      .where(
        and(
          eq(contextManifestItems.userId, scope.userId),
          eq(contextManifestItems.manifestId, id),
        ),
      )
      .orderBy(asc(contextManifestItems.ordinal));
    return {
      createdAt: manifest.createdAt,
      id: contextManifestIdV1Schema.parse(manifest.id),
      items: items.map((item) => ({
        contentHash: item.contentHash,
        entryRevisionId:
          item.entryRevisionId === null
            ? null
            : entryRevisionIdV1Schema.parse(item.entryRevisionId),
        evidenceLane: contextEvidenceLaneV1Schema.parse(item.evidenceLane),
        knowledgeChunkId:
          item.knowledgeChunkId === null
            ? null
            : knowledgeChunkIdV1Schema.parse(item.knowledgeChunkId),
        knowledgeSourceRevisionId:
          item.knowledgeSourceRevisionId === null
            ? null
            : knowledgeSourceRevisionIdV1Schema.parse(
                item.knowledgeSourceRevisionId,
              ),
        manifestId: contextManifestIdV1Schema.parse(item.manifestId),
        methods: item.methods.map((method) =>
          retrievalMethodV1Schema.parse(method),
        ),
        ordinal: item.ordinal,
        policyReference: item.policyReference,
        resourceId:
          item.resourceId === null
            ? null
            : resourceIdV1Schema.parse(item.resourceId),
        score: item.score === null ? null : Number(item.score),
        sourceKind:
          item.sourceKind === null
            ? null
            : retrievalSourceKindV1Schema.parse(item.sourceKind),
      })),
      policyVersion: manifest.policyVersion,
      purpose: contextManifestPurposeV1Schema.parse(manifest.purpose),
      scope,
      semanticRetrievalActive: manifest.semanticRetrievalActive,
    };
  }
}

export class DrizzleRetrievalEmbeddingRepository implements RetrievalEmbeddingRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async saveMany(
    embeddings: readonly RetrievalEmbeddingRecord[],
  ): Promise<void> {
    for (const embedding of embeddings) {
      if (
        embedding.vector.length !== embedding.dimensions ||
        embedding.vector.some((value) => !Number.isFinite(value))
      )
        throw new Error('Embedding dimensions are invalid.');
      const eligible =
        embedding.lane === 'personal' && embedding.entryRevisionId
          ? await this.database
              .select({ id: entryRevisions.id })
              .from(entryRevisions)
              .where(
                and(
                  eq(entryRevisions.userId, embedding.scope.userId),
                  eq(entryRevisions.id, embedding.entryRevisionId),
                  eq(entryRevisions.processingClass, 'standard'),
                ),
              )
              .limit(1)
          : embedding.lane === 'external' && embedding.knowledgeChunkId
            ? await this.database
                .select({ id: knowledgeChunks.id })
                .from(knowledgeChunks)
                .innerJoin(
                  knowledgeSourceRevisions,
                  and(
                    eq(
                      knowledgeSourceRevisions.id,
                      knowledgeChunks.sourceRevisionId,
                    ),
                    eq(knowledgeSourceRevisions.userId, knowledgeChunks.userId),
                  ),
                )
                .where(
                  and(
                    eq(knowledgeChunks.userId, embedding.scope.userId),
                    eq(knowledgeChunks.id, embedding.knowledgeChunkId),
                    eq(knowledgeSourceRevisions.processingClass, 'standard'),
                  ),
                )
                .limit(1)
            : [];
      if (eligible.length !== 1)
        throw new Error('Embedding source is not Standard and owner eligible.');
    }
    if (embeddings.length === 0) return;
    await this.database
      .insert(retrievalEmbeddings)
      .values(
        embeddings.map((embedding) => ({
          contentHash: embedding.contentHash,
          createdAt: embedding.createdAt,
          dimensions: embedding.dimensions,
          embedding: [...embedding.vector],
          entryRevisionId: embedding.entryRevisionId,
          id: embedding.id,
          knowledgeChunkId: embedding.knowledgeChunkId,
          lane: embedding.lane,
          modelId: embedding.modelId,
          modelVersion: embedding.modelVersion,
          sourceKind: embedding.sourceKind,
          userId: embedding.scope.userId,
        })),
      )
      .onConflictDoNothing();
  }
}
