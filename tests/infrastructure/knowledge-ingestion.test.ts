import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalContentAddressedKnowledgeStore,
  LocalKnowledgeSourceParser,
  MAXIMUM_KNOWLEDGE_FILE_BYTES,
} from '../../packages/knowledge/src/index.js';

const temporaryRoots: string[] = [];
const parser = new LocalKnowledgeSourceParser();

function upload(
  text: string,
  fileName = 'source.md',
  mediaType = 'text/markdown',
) {
  return {
    bytes: new TextEncoder().encode(text),
    fileName,
    mediaType,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('WP-18 local knowledge ingestion adapters', () => {
  it('parses UTF-8 Markdown into deterministic exact source spans', async () => {
    const source =
      '# Finding\n\nA synthetic result.\n\n## Limits\n\nSmall sample.';
    const parsed = await parser.parse(upload(source));

    expect(parsed).toMatchObject({
      extractionQuality: 'complete',
      fileFormat: 'markdown',
      parsedText: source,
      parserId: 'meridian-local-document-parser',
      parserVersion: '1.0.0',
    });
    expect(parsed.pageOrSectionMap).toEqual([
      {
        end: source.indexOf('## Limits'),
        kind: 'section',
        label: 'Finding',
        start: 0,
      },
      {
        end: source.length,
        kind: 'section',
        label: 'Limits',
        start: source.indexOf('## Limits'),
      },
    ]);
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0]?.text).toBe(source);
    expect(parsed.chunks[0]?.contentHash).toBe(
      createHash('sha256').update(source).digest('hex'),
    );
  });

  it('fails closed for format mismatch, unsafe bytes, invalid text, and size', async () => {
    await expect(
      parser.parse(
        upload('synthetic', 'source.exe', 'application/octet-stream'),
      ),
    ).rejects.toThrow(
      'Knowledge uploads support plain text, Markdown, and PDF only',
    );
    await expect(
      parser.parse(
        upload(
          'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
          'source.txt',
          'text/plain',
        ),
      ),
    ).rejects.toThrow('failed the local safety screen');
    await expect(
      parser.parse({
        bytes: Uint8Array.from([0xff, 0xfe]),
        fileName: 'source.txt',
        mediaType: 'text/plain',
      }),
    ).rejects.toThrow('not valid UTF-8');
    await expect(
      parser.parse({
        bytes: new Uint8Array(MAXIMUM_KNOWLEDGE_FILE_BYTES + 1),
        fileName: 'source.txt',
        mediaType: 'text/plain',
      }),
    ).rejects.toThrow('exceeds 10 MiB');
  });

  it('rejects active PDF features and retains malformed passive PDFs as failed extraction', async () => {
    await expect(
      parser.parse(
        upload('%PDF-1.7\n/OpenAction 1 0 R', 'source.pdf', 'application/pdf'),
      ),
    ).rejects.toThrow('active or embedded content');

    const parsed = await parser.parse(
      upload(
        '%PDF-1.7\nsynthetic malformed passive file',
        'source.pdf',
        'application/pdf',
      ),
    );
    expect(parsed).toMatchObject({
      chunks: [],
      extractionQuality: 'failed',
      fileFormat: 'pdf',
      parsedText: '',
    });
  });

  it('stores originals by content hash, reuses exact duplicates, and rejects unsafe references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'meridian-knowledge-test-'));
    temporaryRoots.push(root);
    const store = new LocalContentAddressedKnowledgeStore(root);
    const bytes = new TextEncoder().encode('synthetic source');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const reference = await store.put(hash, bytes);

    expect(reference).toBe(`sha256/${hash.slice(0, 2)}/${hash}`);
    expect(Array.from(await store.get(reference))).toEqual(Array.from(bytes));
    expect(await store.put(hash, bytes)).toBe(reference);
    await expect(store.get('../../private')).rejects.toThrow(
      'reference is invalid',
    );
    await expect(store.put('0'.repeat(64), bytes)).rejects.toThrow(
      'hash is invalid',
    );
  });

  it('detects corruption if an existing content-addressed object is replaced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'meridian-knowledge-test-'));
    temporaryRoots.push(root);
    const store = new LocalContentAddressedKnowledgeStore(root);
    const bytes = new TextEncoder().encode('synthetic source');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const reference = await store.put(hash, bytes);
    const path = join(root, ...reference.split('/'));
    await writeFile(path, 'tampered');

    await expect(store.put(hash, bytes)).rejects.toThrow(
      'failed hash validation',
    );
    await expect(store.get(reference)).rejects.toThrow(
      'failed hash validation',
    );
    expect(await readFile(path, 'utf8')).toBe('tampered');
  });
});
