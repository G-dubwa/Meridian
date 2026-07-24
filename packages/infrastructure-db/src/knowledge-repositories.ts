import {
  knowledgeClaimIdV1Schema,
  knowledgeClaimReviewStatusV1Schema,
  knowledgeClaimTypeV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeCitationIdV1Schema,
  knowledgeCorrectionStatusV1Schema,
  knowledgeEpistemicStatusV1Schema,
  knowledgeExtractionQualityV1Schema,
  knowledgeFileFormatV1Schema,
  knowledgeLocatorV1Schema,
  knowledgeReviewStatusV1Schema,
  knowledgeSourceClassV1Schema,
  knowledgeSourceIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  processingClassV1Schema,
} from '@meridian/domain';
import type {
  KnowledgeChunkRecord,
  KnowledgeChunkRepository,
  KnowledgeClaimCitationRecord,
  KnowledgeClaimCitationRepository,
  KnowledgeClaimRecord,
  KnowledgeClaimRepository,
  KnowledgeSourceRecord,
  KnowledgeSourceRepository,
  KnowledgeSourceRevisionRecord,
  KnowledgeSourceRevisionRepository,
  UserScope,
} from '@meridian/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './repositories.js';
import {
  knowledgeChunks,
  knowledgeClaimCitations,
  knowledgeClaims,
  knowledgeSourceRevisions,
  knowledgeSources,
} from './schema.js';

function mapSource(
  row: typeof knowledgeSources.$inferSelect,
  scope: UserScope,
): KnowledgeSourceRecord {
  return {
    authors: row.authors as readonly string[],
    canonicalUrl: row.canonicalUrl,
    copyrightAndUseNotes: row.copyrightAndUseNotes,
    correctionStatus: knowledgeCorrectionStatusV1Schema.parse(
      row.correctionStatus,
    ),
    createdAt: row.createdAt,
    deletionRequestedAt: row.deletionRequestedAt,
    doi: row.doi,
    evidenceDomain: row.evidenceDomain as readonly string[],
    id: knowledgeSourceIdV1Schema.parse(row.id),
    language: row.language,
    ownerNotes: row.ownerNotes,
    publicationDate: row.publicationDate,
    publisherOrVenue: row.publisherOrVenue,
    resourceId: row.id as KnowledgeSourceRecord['resourceId'],
    reviewStatus: knowledgeReviewStatusV1Schema.parse(row.reviewStatus),
    scope,
    sourceClass: knowledgeSourceClassV1Schema.parse(row.sourceClass),
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapRevision(
  row: typeof knowledgeSourceRevisions.$inferSelect,
  scope: UserScope,
): KnowledgeSourceRevisionRecord {
  return {
    createdAt: row.createdAt,
    extractionQuality: knowledgeExtractionQualityV1Schema.parse(
      row.extractionQuality,
    ),
    fileFormat: knowledgeFileFormatV1Schema.parse(row.fileFormat),
    id: knowledgeSourceRevisionIdV1Schema.parse(row.id),
    knowledgeSourceId: knowledgeSourceIdV1Schema.parse(row.knowledgeSourceId),
    originalContentHash: row.originalContentHash,
    originalFileName: row.originalFileName,
    originalFileRef: row.originalFileRef,
    originalMediaType: row.originalMediaType,
    pageOrSectionMap: knowledgeLocatorV1Schema
      .array()
      .parse(row.pageOrSectionMap),
    parsedText: row.parsedText,
    parserId: row.parserId,
    parserVersion: row.parserVersion,
    processingClass: processingClassV1Schema.parse(row.processingClass),
    revisionNumber: row.revisionNumber,
    scope,
  };
}

function mapChunk(
  row: typeof knowledgeChunks.$inferSelect,
  scope: UserScope,
): KnowledgeChunkRecord {
  return {
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    id: knowledgeChunkIdV1Schema.parse(row.id),
    locator:
      row.locator === null ? null : knowledgeLocatorV1Schema.parse(row.locator),
    ordinal: row.ordinal,
    scope,
    sourceRevisionId: knowledgeSourceRevisionIdV1Schema.parse(
      row.sourceRevisionId,
    ),
    sourceSpanEnd: row.sourceSpanEnd,
    sourceSpanStart: row.sourceSpanStart,
    text: row.text,
  };
}

function mapClaim(
  row: typeof knowledgeClaims.$inferSelect,
  scope: UserScope,
): KnowledgeClaimRecord {
  return {
    claimText: row.claimText,
    claimType: knowledgeClaimTypeV1Schema.parse(row.claimType),
    createdAt: row.createdAt,
    direction: row.direction,
    effectExpression: row.effectExpression,
    epistemicStatus: knowledgeEpistemicStatusV1Schema.parse(
      row.epistemicStatus,
    ),
    id: knowledgeClaimIdV1Schema.parse(row.id),
    interventionOrExposure: row.interventionOrExposure,
    knowledgeSourceId: knowledgeSourceIdV1Schema.parse(row.knowledgeSourceId),
    outcome: row.outcome,
    populationScope: row.populationScope,
    resourceId: row.id as KnowledgeClaimRecord['resourceId'],
    reviewStatus: knowledgeClaimReviewStatusV1Schema.parse(row.reviewStatus),
    reviewerNotes: row.reviewerNotes,
    scope,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapCitation(
  row: typeof knowledgeClaimCitations.$inferSelect,
  scope: UserScope,
): KnowledgeClaimCitationRecord {
  return {
    claimId: knowledgeClaimIdV1Schema.parse(row.claimId),
    createdAt: row.createdAt,
    id: knowledgeCitationIdV1Schema.parse(row.id),
    locator:
      row.locator === null ? null : knowledgeLocatorV1Schema.parse(row.locator),
    quotedTextHash: row.quotedTextHash,
    scope,
    sourceRevisionId: knowledgeSourceRevisionIdV1Schema.parse(
      row.sourceRevisionId,
    ),
    sourceSpanEnd: row.sourceSpanEnd,
    sourceSpanStart: row.sourceSpanStart,
  };
}

export class DrizzleKnowledgeSourceRepository implements KnowledgeSourceRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async acquireContentHashLock(
    scope: UserScope,
    contentHash: string,
  ): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${scope.userId}:knowledge:${contentHash}`}))`,
    );
  }

  public async findById(
    scope: UserScope,
    id: KnowledgeSourceRecord['id'],
  ): Promise<KnowledgeSourceRecord | null> {
    const [row] = await this.database
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.userId, scope.userId),
          eq(knowledgeSources.id, id),
        ),
      )
      .limit(1);
    return row ? mapSource(row, scope) : null;
  }

  public async list(
    scope: UserScope,
  ): Promise<readonly KnowledgeSourceRecord[]> {
    const rows = await this.database
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.userId, scope.userId))
      .orderBy(desc(knowledgeSources.updatedAt));
    return rows.map((row) => mapSource(row, scope));
  }

  public async save(source: KnowledgeSourceRecord): Promise<void> {
    await this.database.insert(knowledgeSources).values({
      authors: source.authors,
      canonicalUrl: source.canonicalUrl,
      copyrightAndUseNotes: source.copyrightAndUseNotes,
      correctionStatus: source.correctionStatus,
      createdAt: source.createdAt,
      deletionRequestedAt: source.deletionRequestedAt,
      doi: source.doi,
      evidenceDomain: source.evidenceDomain,
      id: source.id,
      language: source.language,
      ownerNotes: source.ownerNotes,
      publicationDate: source.publicationDate,
      publisherOrVenue: source.publisherOrVenue,
      reviewStatus: source.reviewStatus,
      sourceClass: source.sourceClass,
      title: source.title,
      updatedAt: source.updatedAt,
      userId: source.scope.userId,
      version: source.version,
    });
  }

  public async update(
    source: KnowledgeSourceRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(knowledgeSources)
      .set({
        correctionStatus: source.correctionStatus,
        deletionRequestedAt: source.deletionRequestedAt,
        reviewStatus: source.reviewStatus,
        updatedAt: source.updatedAt,
        version: source.version,
      })
      .where(
        and(
          eq(knowledgeSources.id, source.id),
          eq(knowledgeSources.userId, source.scope.userId),
          eq(knowledgeSources.version, expectedVersion),
        ),
      )
      .returning({ id: knowledgeSources.id });
    return rows.length === 1;
  }
}

export class DrizzleKnowledgeSourceRevisionRepository implements KnowledgeSourceRevisionRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: KnowledgeSourceRevisionRecord['id'],
  ): Promise<KnowledgeSourceRevisionRecord | null> {
    const [row] = await this.database
      .select()
      .from(knowledgeSourceRevisions)
      .where(
        and(
          eq(knowledgeSourceRevisions.userId, scope.userId),
          eq(knowledgeSourceRevisions.id, id),
        ),
      )
      .limit(1);
    return row ? mapRevision(row, scope) : null;
  }

  public async findByContentHash(
    scope: UserScope,
    contentHash: string,
  ): Promise<KnowledgeSourceRevisionRecord | null> {
    const [row] = await this.database
      .select()
      .from(knowledgeSourceRevisions)
      .where(
        and(
          eq(knowledgeSourceRevisions.userId, scope.userId),
          eq(knowledgeSourceRevisions.originalContentHash, contentHash),
        ),
      )
      .limit(1);
    return row ? mapRevision(row, scope) : null;
  }

  public async latestForSource(
    scope: UserScope,
    sourceId: KnowledgeSourceRecord['id'],
  ): Promise<KnowledgeSourceRevisionRecord | null> {
    const [row] = await this.database
      .select()
      .from(knowledgeSourceRevisions)
      .where(
        and(
          eq(knowledgeSourceRevisions.userId, scope.userId),
          eq(knowledgeSourceRevisions.knowledgeSourceId, sourceId),
        ),
      )
      .orderBy(desc(knowledgeSourceRevisions.revisionNumber))
      .limit(1);
    return row ? mapRevision(row, scope) : null;
  }

  public async listForSource(
    scope: UserScope,
    sourceId: KnowledgeSourceRecord['id'],
  ): Promise<readonly KnowledgeSourceRevisionRecord[]> {
    const rows = await this.database
      .select()
      .from(knowledgeSourceRevisions)
      .where(
        and(
          eq(knowledgeSourceRevisions.userId, scope.userId),
          eq(knowledgeSourceRevisions.knowledgeSourceId, sourceId),
        ),
      )
      .orderBy(asc(knowledgeSourceRevisions.revisionNumber));
    return rows.map((row) => mapRevision(row, scope));
  }

  public async append(revision: KnowledgeSourceRevisionRecord): Promise<void> {
    await this.database.insert(knowledgeSourceRevisions).values({
      createdAt: revision.createdAt,
      extractionQuality: revision.extractionQuality,
      fileFormat: revision.fileFormat,
      id: revision.id,
      knowledgeSourceId: revision.knowledgeSourceId,
      originalContentHash: revision.originalContentHash,
      originalFileName: revision.originalFileName,
      originalFileRef: revision.originalFileRef,
      originalMediaType: revision.originalMediaType,
      pageOrSectionMap: revision.pageOrSectionMap,
      parsedText: revision.parsedText,
      parserId: revision.parserId,
      parserVersion: revision.parserVersion,
      processingClass: revision.processingClass,
      revisionNumber: revision.revisionNumber,
      userId: revision.scope.userId,
    });
  }
}

export class DrizzleKnowledgeChunkRepository implements KnowledgeChunkRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async listForRevision(
    scope: UserScope,
    revisionId: KnowledgeChunkRecord['sourceRevisionId'],
  ): Promise<readonly KnowledgeChunkRecord[]> {
    const rows = await this.database
      .select()
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.userId, scope.userId),
          eq(knowledgeChunks.sourceRevisionId, revisionId),
        ),
      )
      .orderBy(asc(knowledgeChunks.ordinal));
    return rows.map((row) => mapChunk(row, scope));
  }

  public async saveMany(
    chunks: readonly KnowledgeChunkRecord[],
  ): Promise<void> {
    if (chunks.length === 0) return;
    await this.database.insert(knowledgeChunks).values(
      chunks.map((chunk) => ({
        contentHash: chunk.contentHash,
        createdAt: chunk.createdAt,
        id: chunk.id,
        locator: chunk.locator,
        ordinal: chunk.ordinal,
        sourceRevisionId: chunk.sourceRevisionId,
        sourceSpanEnd: chunk.sourceSpanEnd,
        sourceSpanStart: chunk.sourceSpanStart,
        text: chunk.text,
        userId: chunk.scope.userId,
      })),
    );
  }
}

export class DrizzleKnowledgeClaimRepository implements KnowledgeClaimRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async findById(
    scope: UserScope,
    id: KnowledgeClaimRecord['id'],
  ): Promise<KnowledgeClaimRecord | null> {
    const [row] = await this.database
      .select()
      .from(knowledgeClaims)
      .where(
        and(
          eq(knowledgeClaims.userId, scope.userId),
          eq(knowledgeClaims.id, id),
        ),
      )
      .limit(1);
    return row ? mapClaim(row, scope) : null;
  }

  public async listForSource(
    scope: UserScope,
    sourceId: KnowledgeSourceRecord['id'],
  ): Promise<readonly KnowledgeClaimRecord[]> {
    const rows = await this.database
      .select()
      .from(knowledgeClaims)
      .where(
        and(
          eq(knowledgeClaims.userId, scope.userId),
          eq(knowledgeClaims.knowledgeSourceId, sourceId),
        ),
      )
      .orderBy(desc(knowledgeClaims.updatedAt));
    return rows.map((row) => mapClaim(row, scope));
  }

  public async save(claim: KnowledgeClaimRecord): Promise<void> {
    await this.database.insert(knowledgeClaims).values({
      claimText: claim.claimText,
      claimType: claim.claimType,
      createdAt: claim.createdAt,
      direction: claim.direction,
      effectExpression: claim.effectExpression,
      epistemicStatus: claim.epistemicStatus,
      id: claim.id,
      interventionOrExposure: claim.interventionOrExposure,
      knowledgeSourceId: claim.knowledgeSourceId,
      outcome: claim.outcome,
      populationScope: claim.populationScope,
      reviewStatus: claim.reviewStatus,
      reviewerNotes: claim.reviewerNotes,
      updatedAt: claim.updatedAt,
      userId: claim.scope.userId,
      version: claim.version,
    });
  }

  public async update(
    claim: KnowledgeClaimRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const rows = await this.database
      .update(knowledgeClaims)
      .set({
        reviewStatus: claim.reviewStatus,
        reviewerNotes: claim.reviewerNotes,
        updatedAt: claim.updatedAt,
        version: claim.version,
      })
      .where(
        and(
          eq(knowledgeClaims.id, claim.id),
          eq(knowledgeClaims.userId, claim.scope.userId),
          eq(knowledgeClaims.version, expectedVersion),
        ),
      )
      .returning({ id: knowledgeClaims.id });
    return rows.length === 1;
  }

  public async supersedeForSource(
    scope: UserScope,
    sourceId: KnowledgeSourceRecord['id'],
    at: Date,
  ): Promise<number> {
    const rows = await this.database
      .update(knowledgeClaims)
      .set({
        reviewStatus: 'superseded',
        updatedAt: at,
        version: sql`${knowledgeClaims.version} + 1`,
      })
      .where(
        and(
          eq(knowledgeClaims.userId, scope.userId),
          eq(knowledgeClaims.knowledgeSourceId, sourceId),
          inArray(knowledgeClaims.reviewStatus, ['candidate', 'reviewed']),
        ),
      )
      .returning({ id: knowledgeClaims.id });
    return rows.length;
  }
}

export class DrizzleKnowledgeClaimCitationRepository implements KnowledgeClaimCitationRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async listForClaim(
    scope: UserScope,
    claimId: KnowledgeClaimRecord['id'],
  ): Promise<readonly KnowledgeClaimCitationRecord[]> {
    const rows = await this.database
      .select()
      .from(knowledgeClaimCitations)
      .where(
        and(
          eq(knowledgeClaimCitations.userId, scope.userId),
          eq(knowledgeClaimCitations.claimId, claimId),
        ),
      )
      .orderBy(asc(knowledgeClaimCitations.sourceSpanStart));
    return rows.map((row) => mapCitation(row, scope));
  }

  public async save(citation: KnowledgeClaimCitationRecord): Promise<void> {
    await this.database.insert(knowledgeClaimCitations).values({
      claimId: citation.claimId,
      createdAt: citation.createdAt,
      id: citation.id,
      locator: citation.locator,
      quotedTextHash: citation.quotedTextHash,
      sourceRevisionId: citation.sourceRevisionId,
      sourceSpanEnd: citation.sourceSpanEnd,
      sourceSpanStart: citation.sourceSpanStart,
      userId: citation.scope.userId,
    });
  }
}
