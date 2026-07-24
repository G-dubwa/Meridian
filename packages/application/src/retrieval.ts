import {
  contextManifestIdV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  outboxMessageIdV1Schema,
  retrievalEventPayloadV1Schema,
  retrievalSearchInputV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  ContextManifestRecord,
  EmbeddingPort,
  EmbeddingResult,
  IdGenerator,
  OutboxMessageRecord,
  RetrievalCandidateRecord,
  RetrievalSearchInputV1,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';
import {
  RETRIEVAL_POLICY_VERSION,
  assembleSeparatedLanes,
  manifestItemsFor,
  normalizeQuery,
} from '@meridian/retrieval';

export interface RetrievalServiceDependencies {
  readonly clock: Clock;
  readonly embeddings: EmbeddingPort;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

export interface RetrievalCommandContext {
  readonly correlationId: Uuid;
}

export interface RetrievalPreview {
  readonly candidates: readonly RetrievalCandidateRecord[];
  readonly manifest: ContextManifestRecord;
}

async function appendManifestEvent(
  dependencies: RetrievalServiceDependencies,
  ports: TransactionPorts,
  manifest: ContextManifestRecord,
  context: RetrievalCommandContext,
): Promise<void> {
  const personalItemCount = manifest.items.filter(
    (item) => item.evidenceLane === 'personal_evidence',
  ).length;
  const externalItemCount = manifest.items.filter(
    (item) => item.evidenceLane === 'external_evidence',
  ).length;
  const event = domainEventEnvelopeV1Schema.parse({
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType: 'retrieval.context_manifest_created.v1',
    occurredAt: manifest.createdAt.toISOString(),
    payload: retrievalEventPayloadV1Schema.parse({
      externalItemCount,
      manifestId: manifest.id,
      personalItemCount,
      policyVersion: manifest.policyVersion,
      purpose: manifest.purpose,
      semanticRetrievalActive: manifest.semanticRetrievalActive,
    }),
    schemaVersion: 1,
    scope: manifest.scope,
  });
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: manifest.createdAt,
    createdAt: manifest.createdAt,
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

export class RetrievalService {
  public constructor(
    private readonly dependencies: RetrievalServiceDependencies,
  ) {}

  public get status() {
    return {
      externalLane: 'local_full_text',
      personalLane: 'local_full_text',
      policyVersion: RETRIEVAL_POLICY_VERSION,
      semanticRetrieval: this.dependencies.embeddings.active
        ? 'test_or_configured'
        : 'inactive',
    } as const;
  }

  public async preview(
    scope: UserScope,
    rawInput: unknown,
    context: RetrievalCommandContext,
  ): Promise<RetrievalPreview> {
    const input: RetrievalSearchInputV1 =
      retrievalSearchInputV1Schema.parse(rawInput);
    const query = normalizeQuery(input.query);
    let queryEmbedding: EmbeddingResult | undefined;
    if (this.dependencies.embeddings.active) {
      queryEmbedding = await this.dependencies.embeddings.embed({
        contentHash: null,
        lane: 'personal',
        processingClass: 'standard',
        text: query,
      });
    }
    const manifestId = contextManifestIdV1Schema.parse(
      this.dependencies.ids.next(),
    );
    const createdAt = this.dependencies.clock.now();
    return this.dependencies.transactions.run(scope, async (ports) => {
      const [personal, external] = await Promise.all([
        input.lanes.includes('personal')
          ? ports.retrievalSearch.searchPersonal(
              scope,
              query,
              input.limitPerLane,
              queryEmbedding,
            )
          : Promise.resolve([]),
        input.lanes.includes('external')
          ? ports.retrievalSearch.searchExternal(
              scope,
              query,
              input.limitPerLane,
              queryEmbedding,
            )
          : Promise.resolve([]),
      ]);
      const candidates = assembleSeparatedLanes(
        personal,
        external,
        input.limitPerLane,
      );
      const manifest: ContextManifestRecord = {
        createdAt,
        id: manifestId,
        items: manifestItemsFor(manifestId, candidates),
        policyVersion: RETRIEVAL_POLICY_VERSION,
        purpose: input.purpose,
        scope,
        semanticRetrievalActive: queryEmbedding !== undefined,
      };
      await ports.contextManifests.save(manifest);
      await appendManifestEvent(this.dependencies, ports, manifest, context);
      return { candidates, manifest };
    });
  }

  public async manifest(
    scope: UserScope,
    id: string,
  ): Promise<ContextManifestRecord | null> {
    const manifestId = contextManifestIdV1Schema.parse(id);
    return this.dependencies.transactions.run(scope, (ports) =>
      ports.contextManifests.findById(scope, manifestId),
    );
  }
}
