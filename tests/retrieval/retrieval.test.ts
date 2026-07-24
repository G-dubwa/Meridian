import { describe, expect, it } from 'vitest';
import {
  contextManifestIdV1Schema,
  entryRevisionIdV1Schema,
  knowledgeChunkIdV1Schema,
  knowledgeSourceRevisionIdV1Schema,
  resourceIdV1Schema,
} from '../../packages/domain/src/index.js';
import type { RetrievalCandidateRecord } from '../../packages/domain/src/index.js';
import {
  DeterministicFixtureEmbeddingAdapter,
  DisabledEmbeddingAdapter,
  RETRIEVAL_POLICY_VERSION,
  assembleSeparatedLanes,
  manifestItemsFor,
  normalizeQuery,
} from '../../packages/retrieval/src/index.js';

const manifestId = contextManifestIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f02900',
);
const personal: RetrievalCandidateRecord = {
  contentHash: '1'.repeat(64),
  entryRevisionId: entryRevisionIdV1Schema.parse(
    '018f0f77-34f1-7ef2-8ca1-7a3bf7f02901',
  ),
  evidenceLane: 'personal_evidence',
  knowledgeChunkId: null,
  knowledgeSourceRevisionId: null,
  locator: null,
  methods: ['full_text'],
  occurredAt: new Date('2026-07-24T08:00:00.000Z'),
  resourceId: resourceIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f02902'),
  score: 0.7,
  sourceKind: 'entry_revision',
  text: 'Synthetic personal evidence.',
  title: 'Journal entry',
};
const external: RetrievalCandidateRecord = {
  contentHash: '2'.repeat(64),
  entryRevisionId: null,
  evidenceLane: 'external_evidence',
  knowledgeChunkId: knowledgeChunkIdV1Schema.parse(
    '018f0f77-34f1-7ef2-8ca1-7a3bf7f02903',
  ),
  knowledgeSourceRevisionId: knowledgeSourceRevisionIdV1Schema.parse(
    '018f0f77-34f1-7ef2-8ca1-7a3bf7f02904',
  ),
  locator: { end: 120, kind: 'page', label: '1', start: 0 },
  methods: ['semantic'],
  occurredAt: new Date('2026-07-23T08:00:00.000Z'),
  resourceId: resourceIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f02905'),
  score: 0.8,
  sourceKind: 'knowledge_chunk',
  text: 'Synthetic external evidence.',
  title: 'Synthetic source',
};

describe('WP-19 retrieval policy and fixture adapter', () => {
  it('normalizes bounded queries and rejects empty or oversized input', () => {
    expect(normalizeQuery('  BOUNDED   Recall  ')).toBe('bounded recall');
    expect(() => normalizeQuery('x')).toThrow('between 2 and 500');
    expect(() => normalizeQuery('x'.repeat(501))).toThrow('between 2 and 500');
  });

  it('keeps personal and external candidates in separate deterministic lanes', () => {
    expect(assembleSeparatedLanes([personal, personal], [external], 5)).toEqual(
      [personal, external],
    );
    expect(() =>
      assembleSeparatedLanes(
        [{ ...personal, evidenceLane: 'external_evidence' }],
        [],
        5,
      ),
    ).toThrow('crossed its evidence lane');
  });

  it('builds an inspectable reference-only manifest headed by policy', () => {
    const items = manifestItemsFor(manifestId, [personal, external]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      contentHash: null,
      evidenceLane: 'system_policy',
      policyReference: RETRIEVAL_POLICY_VERSION,
    });
    expect(items[1]).toMatchObject({
      entryRevisionId: personal.entryRevisionId,
      evidenceLane: 'personal_evidence',
    });
    expect(JSON.stringify(items)).not.toContain(personal.text);
    expect(JSON.stringify(items)).not.toContain(external.text);
  });

  it('keeps runtime embeddings disabled and fixture vectors deterministic', async () => {
    const disabled = new DisabledEmbeddingAdapter();
    await expect(
      disabled.embed({
        contentHash: '0'.repeat(64),
        lane: 'personal',
        processingClass: 'standard',
        text: 'Synthetic query',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_UNAVAILABLE' });

    const fixture = new DeterministicFixtureEmbeddingAdapter();
    const request = {
      contentHash: '0'.repeat(64),
      lane: 'external',
      processingClass: 'standard',
      text: 'Synthetic bounded query',
    } as const;
    const first = await fixture.embed(request);
    const second = await fixture.embed(request);
    expect(first).toEqual(second);
    expect(first.vector).toHaveLength(16);
    expect(
      Math.sqrt(
        first.vector.reduce(
          (total, component) => total + component * component,
          0,
        ),
      ),
    ).toBeCloseTo(1);
    await expect(
      fixture.embed({ ...request, processingClass: 'sensitive' }),
    ).rejects.toThrow('rejects non-Standard');
    await expect(
      fixture.embed({ ...request, processingClass: 'private' }),
    ).rejects.toThrow('rejects non-Standard');
  });
});
