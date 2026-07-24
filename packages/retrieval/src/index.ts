import {
  DomainValidationError,
  IntegrationUnavailableError,
} from '@meridian/domain';
import type {
  ContextManifestId,
  ContextManifestItemRecord,
  EmbeddingPort,
  EmbeddingRequest,
  EmbeddingResult,
  RetrievalCandidateRecord,
} from '@meridian/domain';

export const packageId = '@meridian/retrieval' as const;
export const RETRIEVAL_POLICY_VERSION = 'standard-separated-lanes-v1' as const;

export class DisabledEmbeddingAdapter implements EmbeddingPort {
  public readonly active = false;

  public embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    void request;
    return Promise.reject(new IntegrationUnavailableError());
  }
}

/**
 * A deliberately small, deterministic adapter for synthetic fixtures only.
 * It is not a production semantic model and must never be composed at runtime.
 */
export class DeterministicFixtureEmbeddingAdapter implements EmbeddingPort {
  public readonly active = true;
  public readonly modelId = 'meridian-fixture-token-hash';
  public readonly modelVersion = '1.0.0';
  public readonly dimensions = 16;

  public embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (request.processingClass !== 'standard')
      return Promise.reject(
        new DomainValidationError(
          'Fixture embedding rejects non-Standard content.',
        ),
      );
    const vector = Array.from<number>({ length: this.dimensions }).fill(0);
    for (const token of normalizeQuery(request.text).split(' ')) {
      let accumulator = 2166136261;
      for (const character of token) {
        accumulator ^= character.codePointAt(0) ?? 0;
        accumulator = Math.imul(accumulator, 16777619) >>> 0;
      }
      const index = accumulator % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    const magnitude = Math.sqrt(
      vector.reduce((total, value) => total + value * value, 0),
    );
    const normalized =
      magnitude === 0 ? vector : vector.map((value) => value / magnitude);
    return Promise.resolve({
      dimensions: this.dimensions,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      vector: normalized,
    });
  }
}

export function normalizeQuery(query: string): string {
  const normalized = query
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-ZA')
    .replace(/\s+/gu, ' ');
  if (normalized.length < 2 || normalized.length > 500)
    throw new DomainValidationError(
      'Retrieval query must contain between 2 and 500 characters.',
    );
  return normalized;
}

function candidateKey(candidate: RetrievalCandidateRecord): string {
  return candidate.entryRevisionId
    ? `entry:${candidate.entryRevisionId}`
    : `chunk:${String(candidate.knowledgeChunkId)}`;
}

function validateCandidate(candidate: RetrievalCandidateRecord): void {
  const personal =
    candidate.evidenceLane === 'personal_evidence' &&
    candidate.sourceKind === 'entry_revision' &&
    candidate.entryRevisionId !== null &&
    candidate.knowledgeChunkId === null &&
    candidate.knowledgeSourceRevisionId === null;
  const external =
    candidate.evidenceLane === 'external_evidence' &&
    candidate.sourceKind === 'knowledge_chunk' &&
    candidate.entryRevisionId === null &&
    candidate.knowledgeChunkId !== null &&
    candidate.knowledgeSourceRevisionId !== null;
  if (!personal && !external)
    throw new DomainValidationError(
      'Retrieval candidate crossed its evidence lane.',
    );
  if (!Number.isFinite(candidate.score) || candidate.score < 0)
    throw new DomainValidationError('Retrieval candidate score is invalid.');
}

export function assembleSeparatedLanes(
  personal: readonly RetrievalCandidateRecord[],
  external: readonly RetrievalCandidateRecord[],
  limitPerLane: number,
): readonly RetrievalCandidateRecord[] {
  if (!Number.isInteger(limitPerLane) || limitPerLane < 1 || limitPerLane > 10)
    throw new DomainValidationError('Retrieval lane limit is invalid.');
  const select = (
    candidates: readonly RetrievalCandidateRecord[],
    lane: RetrievalCandidateRecord['evidenceLane'],
  ) => {
    const seen = new Set<string>();
    return candidates
      .filter((candidate) => {
        validateCandidate(candidate);
        if (candidate.evidenceLane !== lane) return false;
        const key = candidateKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.occurredAt.getTime() - left.occurredAt.getTime() ||
          candidateKey(left).localeCompare(candidateKey(right)),
      )
      .slice(0, limitPerLane);
  };
  return [
    ...select(personal, 'personal_evidence'),
    ...select(external, 'external_evidence'),
  ];
}

export function manifestItemsFor(
  manifestId: ContextManifestId,
  candidates: readonly RetrievalCandidateRecord[],
): readonly ContextManifestItemRecord[] {
  const items: ContextManifestItemRecord[] = [
    {
      contentHash: null,
      entryRevisionId: null,
      evidenceLane: 'system_policy',
      knowledgeChunkId: null,
      knowledgeSourceRevisionId: null,
      manifestId,
      methods: [],
      ordinal: 1,
      policyReference: RETRIEVAL_POLICY_VERSION,
      resourceId: null,
      score: null,
      sourceKind: null,
    },
  ];
  for (const [index, candidate] of candidates.entries()) {
    validateCandidate(candidate);
    items.push({
      contentHash: candidate.contentHash,
      entryRevisionId: candidate.entryRevisionId,
      evidenceLane: candidate.evidenceLane,
      knowledgeChunkId: candidate.knowledgeChunkId,
      knowledgeSourceRevisionId: candidate.knowledgeSourceRevisionId,
      manifestId,
      methods: candidate.methods,
      ordinal: index + 2,
      policyReference: null,
      resourceId: candidate.resourceId,
      score: candidate.score,
      sourceKind: candidate.sourceKind,
    });
  }
  return items;
}
