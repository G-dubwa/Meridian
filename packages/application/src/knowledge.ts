import {
  ConflictError,
  DomainValidationError,
  NotFoundError,
  createKnowledgeClaimInputV1Schema,
  createKnowledgeSourceMetadataV1Schema,
  createKnowledgeSourceRevisionInputV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeCitationIdV1Schema,
  knowledgeClaimIdV1Schema,
  knowledgeEventPayloadV1Schema,
  knowledgeSourceIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  outboxMessageIdV1Schema,
  requestKnowledgeSourceDeletionInputV1Schema,
  resourceIdV1Schema,
  reviewKnowledgeClaimInputV1Schema,
  reviewKnowledgeSourceInputV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  DomainEventEnvelopeV1,
  IdGenerator,
  KnowledgeClaimCitationRecord,
  KnowledgeClaimRecord,
  KnowledgeEventType,
  KnowledgeObjectStore,
  KnowledgeSourceParser,
  KnowledgeSourceRecord,
  KnowledgeSourceRevisionRecord,
  KnowledgeUpload,
  OutboxMessageRecord,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';

export interface KnowledgeServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly objectStore: KnowledgeObjectStore;
  readonly parser: KnowledgeSourceParser;
  readonly transactions: TransactionManager;
}

export interface KnowledgeCommandContext {
  readonly correlationId: Uuid;
}

export interface KnowledgeSourceDetail {
  readonly source: KnowledgeSourceRecord;
  readonly revisions: readonly {
    readonly revision: KnowledgeSourceRevisionRecord;
    readonly chunkCount: number;
  }[];
  readonly claims: readonly {
    readonly claim: KnowledgeClaimRecord;
    readonly citations: readonly KnowledgeClaimCitationRecord[];
  }[];
}

function validateFileName(fileName: string): string {
  const trimmed = fileName.trim();
  let hasControlCharacter = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 31 || code === 127) {
      hasControlCharacter = true;
      break;
    }
  }
  if (
    trimmed.length < 1 ||
    trimmed.length > 240 ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    hasControlCharacter
  )
    throw new DomainValidationError('The uploaded filename is invalid.');
  return trimmed;
}

function requireDeletionNotRequested(source: KnowledgeSourceRecord): void {
  if (source.deletionRequestedAt)
    throw new ConflictError(
      'Knowledge source deletion is pending owner-controlled erasure.',
    );
}

function eventFor(
  dependencies: KnowledgeServiceDependencies,
  scope: UserScope,
  context: KnowledgeCommandContext,
  eventType: KnowledgeEventType,
  source: KnowledgeSourceRecord,
  values: {
    readonly claim?: KnowledgeClaimRecord;
    readonly revision?: KnowledgeSourceRevisionRecord;
  },
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: source.resourceId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: knowledgeEventPayloadV1Schema.parse({
      claimId: values.claim?.id ?? null,
      extractionQuality: values.revision?.extractionQuality ?? null,
      reviewStatus: values.claim?.reviewStatus ?? source.reviewStatus,
      sourceId: source.id,
      sourceRevisionId: values.revision?.id ?? null,
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: KnowledgeServiceDependencies,
  ports: TransactionPorts,
  event: DomainEventEnvelopeV1,
  now: Date,
): Promise<void> {
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: now,
    createdAt: now,
    deadLetteredAt: null,
    event,
    id: outboxMessageIdV1Schema.parse(dependencies.ids.next()),
    lastErrorAt: null,
    lastErrorCode: null,
    processedAt: null,
    status: 'pending',
    topic: event.eventType,
  };
  await ports.domainEvents.append(event);
  await ports.outbox.append(outbox);
}

async function detailWithPorts(
  ports: TransactionPorts,
  scope: UserScope,
  source: KnowledgeSourceRecord,
): Promise<KnowledgeSourceDetail> {
  const revisions = await ports.knowledgeSourceRevisions.listForSource(
    scope,
    source.id,
  );
  const claims = await ports.knowledgeClaims.listForSource(scope, source.id);
  return {
    claims: await Promise.all(
      claims.map(async (claim) => ({
        citations: await ports.knowledgeClaimCitations.listForClaim(
          scope,
          claim.id,
        ),
        claim,
      })),
    ),
    revisions: await Promise.all(
      revisions.map(async (revision) => ({
        chunkCount: (
          await ports.knowledgeChunks.listForRevision(scope, revision.id)
        ).length,
        revision,
      })),
    ),
    source,
  };
}

function priorPayload(
  event: DomainEventEnvelopeV1 | null,
): ReturnType<typeof knowledgeEventPayloadV1Schema.parse> | null {
  return event ? knowledgeEventPayloadV1Schema.parse(event.payload) : null;
}

export class KnowledgeService {
  public constructor(
    private readonly dependencies: KnowledgeServiceDependencies,
  ) {}

  public get maximumUploadBytes(): number {
    return this.dependencies.parser.maximumBytes;
  }

  public async upload(
    scope: UserScope,
    rawMetadata: unknown,
    upload: KnowledgeUpload,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeSourceDetail> {
    const metadata = createKnowledgeSourceMetadataV1Schema.parse(rawMetadata);
    const fileName = validateFileName(upload.fileName);
    if (upload.bytes.byteLength > this.dependencies.parser.maximumBytes)
      throw new DomainValidationError('The uploaded source is too large.');
    const parsed = await this.dependencies.parser.parse({
      ...upload,
      fileName,
    });
    const objectRef = await this.dependencies.objectStore.put(
      parsed.originalContentHash,
      upload.bytes,
    );
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.knowledgeSources.acquireContentHashLock(
        scope,
        parsed.originalContentHash,
      );
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.source_ingested.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.source_ingested.v1',
        ),
      );
      if (prior) {
        const existing = await ports.knowledgeSources.findById(
          scope,
          prior.sourceId,
        );
        if (!existing)
          throw new ConflictError(
            'Stored knowledge command result is missing.',
          );
        return detailWithPorts(ports, scope, existing);
      }
      const duplicate = await ports.knowledgeSourceRevisions.findByContentHash(
        scope,
        parsed.originalContentHash,
      );
      if (duplicate)
        throw new ConflictError('This exact source file is already retained.');
      const now = this.dependencies.clock.now();
      const sourceId = knowledgeSourceIdV1Schema.parse(
        this.dependencies.ids.next(),
      );
      const source: KnowledgeSourceRecord = {
        authors: metadata.authors,
        canonicalUrl: metadata.canonicalUrl,
        copyrightAndUseNotes: metadata.copyrightAndUseNotes,
        correctionStatus: 'unknown',
        createdAt: now,
        deletionRequestedAt: null,
        doi: metadata.doi,
        evidenceDomain: metadata.evidenceDomain,
        id: sourceId,
        language: metadata.language,
        ownerNotes: metadata.ownerNotes,
        publicationDate: metadata.publicationDate,
        publisherOrVenue: metadata.publisherOrVenue,
        resourceId: resourceIdV1Schema.parse(sourceId),
        reviewStatus: 'unreviewed',
        scope,
        sourceClass: metadata.sourceClass,
        title: metadata.title,
        updatedAt: now,
        version: 1,
      };
      const revision: KnowledgeSourceRevisionRecord = {
        createdAt: now,
        extractionQuality: parsed.extractionQuality,
        fileFormat: parsed.fileFormat,
        id: knowledgeSourceRevisionIdV1Schema.parse(
          this.dependencies.ids.next(),
        ),
        knowledgeSourceId: source.id,
        originalContentHash: parsed.originalContentHash,
        originalFileName: fileName,
        originalFileRef: objectRef,
        originalMediaType: upload.mediaType,
        pageOrSectionMap: parsed.pageOrSectionMap,
        parsedText: parsed.parsedText,
        parserId: parsed.parserId,
        parserVersion: parsed.parserVersion,
        processingClass: metadata.processingClass,
        revisionNumber: 1,
        scope,
      };
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: source.resourceId,
        resourceType: 'resource.knowledge_source',
        scope,
      });
      await ports.knowledgeSources.save(source);
      await ports.knowledgeSourceRevisions.append(revision);
      await ports.knowledgeChunks.saveMany(
        parsed.chunks.map((chunk) => ({
          ...chunk,
          createdAt: now,
          id: knowledgeChunkIdV1Schema.parse(this.dependencies.ids.next()),
          scope,
          sourceRevisionId: revision.id,
        })),
      );
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.source_ingested.v1',
          source,
          { revision },
          now,
        ),
        now,
      );
      return detailWithPorts(ports, scope, source);
    });
  }

  public async revise(
    scope: UserScope,
    rawSourceId: string,
    rawInput: unknown,
    upload: KnowledgeUpload,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeSourceDetail> {
    const sourceId = knowledgeSourceIdV1Schema.parse(rawSourceId);
    const input = createKnowledgeSourceRevisionInputV1Schema.parse(rawInput);
    const fileName = validateFileName(upload.fileName);
    const parsed = await this.dependencies.parser.parse({
      ...upload,
      fileName,
    });
    const objectRef = await this.dependencies.objectStore.put(
      parsed.originalContentHash,
      upload.bytes,
    );
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.knowledgeSources.acquireContentHashLock(
        scope,
        parsed.originalContentHash,
      );
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.source_revised.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.source_revised.v1',
        ),
      );
      if (prior) {
        const existing = await ports.knowledgeSources.findById(scope, sourceId);
        if (existing?.id !== prior.sourceId)
          throw new ConflictError(
            'Stored knowledge command result is missing.',
          );
        return detailWithPorts(ports, scope, existing);
      }
      const source = await ports.knowledgeSources.findById(scope, sourceId);
      if (!source) throw new NotFoundError('Knowledge source was not found.');
      requireDeletionNotRequested(source);
      if (source.version !== input.expectedSourceVersion)
        throw new ConflictError('Knowledge source version is stale.');
      if (
        await ports.knowledgeSourceRevisions.findByContentHash(
          scope,
          parsed.originalContentHash,
        )
      )
        throw new ConflictError('This exact source file is already retained.');
      const latest = await ports.knowledgeSourceRevisions.latestForSource(
        scope,
        source.id,
      );
      if (!latest)
        throw new ConflictError('Knowledge source revision is missing.');
      const now = this.dependencies.clock.now();
      const revision: KnowledgeSourceRevisionRecord = {
        createdAt: now,
        extractionQuality: parsed.extractionQuality,
        fileFormat: parsed.fileFormat,
        id: knowledgeSourceRevisionIdV1Schema.parse(
          this.dependencies.ids.next(),
        ),
        knowledgeSourceId: source.id,
        originalContentHash: parsed.originalContentHash,
        originalFileName: fileName,
        originalFileRef: objectRef,
        originalMediaType: upload.mediaType,
        pageOrSectionMap: parsed.pageOrSectionMap,
        parsedText: parsed.parsedText,
        parserId: parsed.parserId,
        parserVersion: parsed.parserVersion,
        processingClass: input.processingClass,
        revisionNumber: latest.revisionNumber + 1,
        scope,
      };
      const updated: KnowledgeSourceRecord = {
        ...source,
        correctionStatus: 'corrected',
        reviewStatus: 'unreviewed',
        updatedAt: now,
        version: source.version + 1,
      };
      await ports.knowledgeSourceRevisions.append(revision);
      await ports.knowledgeChunks.saveMany(
        parsed.chunks.map((chunk) => ({
          ...chunk,
          createdAt: now,
          id: knowledgeChunkIdV1Schema.parse(this.dependencies.ids.next()),
          scope,
          sourceRevisionId: revision.id,
        })),
      );
      await ports.knowledgeClaims.supersedeForSource(scope, source.id, now);
      if (!(await ports.knowledgeSources.update(updated, source.version)))
        throw new ConflictError('Knowledge source changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.source_revised.v1',
          updated,
          { revision },
          now,
        ),
        now,
      );
      return detailWithPorts(ports, scope, updated);
    });
  }

  public list(scope: UserScope): Promise<readonly KnowledgeSourceRecord[]> {
    return this.dependencies.transactions.run(scope, (ports) =>
      ports.knowledgeSources.list(scope),
    );
  }

  public detail(
    scope: UserScope,
    rawSourceId: string,
  ): Promise<KnowledgeSourceDetail> {
    const sourceId = knowledgeSourceIdV1Schema.parse(rawSourceId);
    return this.dependencies.transactions.run(scope, async (ports) => {
      const source = await ports.knowledgeSources.findById(scope, sourceId);
      if (!source) throw new NotFoundError('Knowledge source was not found.');
      return detailWithPorts(ports, scope, source);
    });
  }

  public reviewSource(
    scope: UserScope,
    rawSourceId: string,
    rawInput: unknown,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeSourceRecord> {
    const sourceId = knowledgeSourceIdV1Schema.parse(rawSourceId);
    const input = reviewKnowledgeSourceInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.source_reviewed.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.source_reviewed.v1',
        ),
      );
      const source = await ports.knowledgeSources.findById(scope, sourceId);
      if (!source) throw new NotFoundError('Knowledge source was not found.');
      if (prior) {
        if (prior.sourceId !== source.id)
          throw new ConflictError('Stored knowledge command target differs.');
        return source;
      }
      requireDeletionNotRequested(source);
      if (source.version !== input.expectedVersion)
        throw new ConflictError('Knowledge source version is stale.');
      const latest = await ports.knowledgeSourceRevisions.latestForSource(
        scope,
        source.id,
      );
      if (!latest)
        throw new ConflictError('Knowledge source revision is missing.');
      if (latest.extractionQuality === 'failed')
        throw new ConflictError('A failed extraction cannot be reviewed.');
      const now = this.dependencies.clock.now();
      const updated = {
        ...source,
        reviewStatus: input.reviewStatus,
        updatedAt: now,
        version: source.version + 1,
      };
      if (!(await ports.knowledgeSources.update(updated, source.version)))
        throw new ConflictError('Knowledge source changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.source_reviewed.v1',
          updated,
          { revision: latest },
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public createClaim(
    scope: UserScope,
    rawSourceId: string,
    rawInput: unknown,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeClaimRecord> {
    const sourceId = knowledgeSourceIdV1Schema.parse(rawSourceId);
    const input = createKnowledgeClaimInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.claim_created.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.claim_created.v1',
        ),
      );
      const source = await ports.knowledgeSources.findById(scope, sourceId);
      if (!source) throw new NotFoundError('Knowledge source was not found.');
      requireDeletionNotRequested(source);
      if (prior?.claimId) {
        const existing = await ports.knowledgeClaims.findById(
          scope,
          prior.claimId,
        );
        if (existing?.knowledgeSourceId !== source.id)
          throw new ConflictError(
            'Stored knowledge command result is missing.',
          );
        return existing;
      }
      const revision = await ports.knowledgeSourceRevisions.findById(
        scope,
        input.sourceRevisionId,
      );
      if (revision?.knowledgeSourceId !== source.id)
        throw new NotFoundError('Knowledge source revision was not found.');
      const quoted = revision.parsedText.slice(
        input.sourceSpanStart,
        input.sourceSpanEnd,
      );
      if (quoted !== input.claimText)
        throw new DomainValidationError(
          'Candidate claims must exactly match their retained source span.',
        );
      const locator =
        revision.pageOrSectionMap.find(
          (candidate) =>
            input.sourceSpanStart < candidate.end &&
            input.sourceSpanEnd > candidate.start,
        ) ?? null;
      const now = this.dependencies.clock.now();
      const claimId = knowledgeClaimIdV1Schema.parse(
        this.dependencies.ids.next(),
      );
      const claim: KnowledgeClaimRecord = {
        claimText: input.claimText,
        claimType: input.claimType,
        createdAt: now,
        direction: input.direction,
        effectExpression: input.effectExpression,
        epistemicStatus: 'reported_by_source',
        id: claimId,
        interventionOrExposure: input.interventionOrExposure,
        knowledgeSourceId: source.id,
        outcome: input.outcome,
        populationScope: input.populationScope,
        resourceId: resourceIdV1Schema.parse(claimId),
        reviewStatus: 'candidate',
        reviewerNotes: null,
        scope,
        updatedAt: now,
        version: 1,
      };
      const citation: KnowledgeClaimCitationRecord = {
        claimId: claim.id,
        createdAt: now,
        id: knowledgeCitationIdV1Schema.parse(this.dependencies.ids.next()),
        locator,
        quotedTextHash: this.dependencies.parser.hashText(quoted),
        scope,
        sourceRevisionId: revision.id,
        sourceSpanEnd: input.sourceSpanEnd,
        sourceSpanStart: input.sourceSpanStart,
      };
      await ports.resources.save({
        createdAt: now,
        deletedAt: null,
        id: claim.resourceId,
        resourceType: 'resource.knowledge_claim',
        scope,
      });
      await ports.knowledgeClaims.save(claim);
      await ports.knowledgeClaimCitations.save(citation);
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.claim_created.v1',
          source,
          { claim, revision },
          now,
        ),
        now,
      );
      return claim;
    });
  }

  public reviewClaim(
    scope: UserScope,
    rawClaimId: string,
    rawInput: unknown,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeClaimRecord> {
    const claimId = knowledgeClaimIdV1Schema.parse(rawClaimId);
    const input = reviewKnowledgeClaimInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.claim_reviewed.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.claim_reviewed.v1',
        ),
      );
      const claim = await ports.knowledgeClaims.findById(scope, claimId);
      if (!claim) throw new NotFoundError('Knowledge claim was not found.');
      if (prior) {
        if (prior.claimId !== claim.id)
          throw new ConflictError('Stored knowledge command target differs.');
        return claim;
      }
      if (claim.version !== input.expectedVersion)
        throw new ConflictError('Knowledge claim version is stale.');
      if (claim.reviewStatus !== 'candidate')
        throw new ConflictError('Knowledge claim is no longer pending review.');
      const source = await ports.knowledgeSources.findById(
        scope,
        claim.knowledgeSourceId,
      );
      if (!source) throw new ConflictError('Knowledge source is missing.');
      requireDeletionNotRequested(source);
      const citations = await ports.knowledgeClaimCitations.listForClaim(
        scope,
        claim.id,
      );
      if (citations.length === 0)
        throw new ConflictError('Knowledge claim has no source citation.');
      const [citation] = citations;
      if (!citation)
        throw new ConflictError('Knowledge claim has no source citation.');
      const now = this.dependencies.clock.now();
      const updated: KnowledgeClaimRecord = {
        ...claim,
        reviewStatus: input.decision,
        reviewerNotes: input.reviewerNotes,
        updatedAt: now,
        version: claim.version + 1,
      };
      if (!(await ports.knowledgeClaims.update(updated, claim.version)))
        throw new ConflictError('Knowledge claim changed concurrently.');
      const revision = await ports.knowledgeSourceRevisions.findById(
        scope,
        citation.sourceRevisionId,
      );
      if (!revision)
        throw new ConflictError('Knowledge citation revision is missing.');
      const citedText = revision.parsedText.slice(
        citation.sourceSpanStart,
        citation.sourceSpanEnd,
      );
      if (
        citedText !== claim.claimText ||
        this.dependencies.parser.hashText(citedText) !== citation.quotedTextHash
      )
        throw new ConflictError(
          'Knowledge claim no longer round-trips to its source span.',
        );
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.claim_reviewed.v1',
          source,
          {
            claim: updated,
            revision,
          },
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public requestDeletion(
    scope: UserScope,
    rawSourceId: string,
    rawInput: unknown,
    context: KnowledgeCommandContext,
  ): Promise<KnowledgeSourceRecord> {
    const sourceId = knowledgeSourceIdV1Schema.parse(rawSourceId);
    const input = requestKnowledgeSourceDeletionInputV1Schema.parse(rawInput);
    return this.dependencies.transactions.run(scope, async (ports) => {
      await ports.domainEvents.acquireCommandLock(
        scope,
        context.correlationId,
        'knowledge.source_deletion_requested.v1',
      );
      const prior = priorPayload(
        await ports.domainEvents.findByCorrelation(
          scope,
          context.correlationId,
          'knowledge.source_deletion_requested.v1',
        ),
      );
      const source = await ports.knowledgeSources.findById(scope, sourceId);
      if (!source) throw new NotFoundError('Knowledge source was not found.');
      if (prior) {
        if (prior.sourceId !== source.id)
          throw new ConflictError('Stored knowledge command target differs.');
        return source;
      }
      requireDeletionNotRequested(source);
      if (source.version !== input.expectedVersion)
        throw new ConflictError('Knowledge source version is stale.');
      const now = this.dependencies.clock.now();
      const updated: KnowledgeSourceRecord = {
        ...source,
        deletionRequestedAt: now,
        updatedAt: now,
        version: source.version + 1,
      };
      if (!(await ports.knowledgeSources.update(updated, source.version)))
        throw new ConflictError('Knowledge source changed concurrently.');
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(
          this.dependencies,
          scope,
          context,
          'knowledge.source_deletion_requested.v1',
          updated,
          {},
          now,
        ),
        now,
      );
      return updated;
    });
  }

  public async original(
    scope: UserScope,
    rawRevisionId: string,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly fileName: string;
    readonly mediaType: string;
  }> {
    const revisionId = knowledgeSourceRevisionIdV1Schema.parse(rawRevisionId);
    const revision = await this.dependencies.transactions.run(
      scope,
      async (ports) => {
        const found = await ports.knowledgeSourceRevisions.findById(
          scope,
          revisionId,
        );
        if (!found)
          throw new NotFoundError('Knowledge source revision was not found.');
        return found;
      },
    );
    return {
      bytes: await this.dependencies.objectStore.get(revision.originalFileRef),
      fileName: revision.originalFileName,
      mediaType: revision.originalMediaType,
    };
  }
}
