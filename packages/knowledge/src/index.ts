import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DomainValidationError } from '@meridian/domain';
import type {
  KnowledgeLocatorV1,
  KnowledgeObjectStore,
  KnowledgeSourceParser,
  KnowledgeUpload,
  ParsedKnowledgeDocument,
} from '@meridian/domain';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const packageId = '@meridian/knowledge' as const;
export const LOCAL_KNOWLEDGE_PARSER_ID = 'meridian-local-document-parser';
export const LOCAL_KNOWLEDGE_PARSER_VERSION = '1.0.0';
export const MAXIMUM_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function formatFor(upload: KnowledgeUpload) {
  const lowerName = upload.fileName.toLowerCase();
  if (
    (upload.mediaType === 'text/plain' ||
      upload.mediaType === 'application/octet-stream') &&
    lowerName.endsWith('.txt')
  )
    return 'plain_text' as const;
  if (
    (upload.mediaType === 'text/markdown' ||
      upload.mediaType === 'text/plain' ||
      upload.mediaType === 'application/octet-stream') &&
    (lowerName.endsWith('.md') || lowerName.endsWith('.markdown'))
  )
    return 'markdown' as const;
  if (
    (upload.mediaType === 'application/pdf' ||
      upload.mediaType === 'application/octet-stream') &&
    lowerName.endsWith('.pdf')
  )
    return 'pdf' as const;
  throw new DomainValidationError(
    'Knowledge uploads support plain text, Markdown, and PDF only.',
  );
}

function screenBytes(upload: KnowledgeUpload): void {
  if (upload.bytes.byteLength === 0)
    throw new DomainValidationError('The uploaded source is empty.');
  if (upload.bytes.byteLength > MAXIMUM_KNOWLEDGE_FILE_BYTES)
    throw new DomainValidationError('The uploaded source exceeds 10 MiB.');
  const signatureText = new TextDecoder('latin1').decode(upload.bytes);
  if (signatureText.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))
    throw new DomainValidationError(
      'The uploaded source failed the local safety screen.',
    );
}

function textDocument(
  upload: KnowledgeUpload,
  format: 'plain_text' | 'markdown',
): {
  parsedText: string;
  pageOrSectionMap: readonly KnowledgeLocatorV1[];
} {
  let parsedText: string;
  try {
    parsedText = new TextDecoder('utf-8', { fatal: true })
      .decode(upload.bytes)
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  } catch {
    throw new DomainValidationError('The uploaded text is not valid UTF-8.');
  }
  if (parsedText.includes('\u0000'))
    throw new DomainValidationError(
      'The uploaded text contains prohibited null bytes.',
    );
  if (parsedText.trim().length === 0)
    throw new DomainValidationError('The uploaded source has no text.');
  if (format === 'plain_text')
    return {
      pageOrSectionMap: [
        {
          end: parsedText.length,
          kind: 'section',
          label: 'Document',
          start: 0,
        },
      ],
      parsedText,
    };

  const headings = [...parsedText.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
    (match) => {
      const parsedLabel = match[1]?.trim().slice(0, 240);
      return {
        label:
          parsedLabel !== undefined && parsedLabel.length > 0
            ? parsedLabel
            : 'Untitled section',
        start: match.index,
      };
    },
  );
  const pageOrSectionMap =
    headings.length === 0
      ? [
          {
            end: parsedText.length,
            kind: 'section' as const,
            label: 'Document',
            start: 0,
          },
        ]
      : headings.map((heading, index) => ({
          end: headings[index + 1]?.start ?? parsedText.length,
          kind: 'section' as const,
          label: heading.label,
          start: heading.start,
        }));
  return { pageOrSectionMap, parsedText };
}

async function pdfDocument(upload: KnowledgeUpload): Promise<{
  parsedText: string;
  pageOrSectionMap: readonly KnowledgeLocatorV1[];
  quality: 'complete' | 'ocr_required' | 'failed';
}> {
  const signatureText = new TextDecoder('latin1').decode(upload.bytes);
  if (!signatureText.startsWith('%PDF-'))
    throw new DomainValidationError('The uploaded PDF signature is invalid.');
  if (
    /\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia)\b/.test(
      signatureText,
    )
  )
    throw new DomainValidationError(
      'PDFs with active or embedded content are not accepted.',
    );
  try {
    const loading = getDocument({
      data: upload.bytes,
      stopAtErrors: true,
      useSystemFonts: false,
      useWasm: false,
    });
    const pdf = await loading.promise;
    let parsedText = '';
    const pageOrSectionMap: KnowledgeLocatorV1[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
      if (pageNumber > 1) parsedText += '\n\n';
      const start = parsedText.length;
      parsedText += pageText;
      pageOrSectionMap.push({
        end: parsedText.length,
        kind: 'page',
        label: `Page ${String(pageNumber)}`,
        start,
      });
    }
    await loading.destroy();
    return {
      pageOrSectionMap,
      parsedText,
      quality: parsedText.trim().length === 0 ? 'ocr_required' : 'complete',
    };
  } catch {
    return { pageOrSectionMap: [], parsedText: '', quality: 'failed' };
  }
}

function locatorFor(
  start: number,
  end: number,
  map: readonly KnowledgeLocatorV1[],
): KnowledgeLocatorV1 | null {
  const locator = map.find(
    (candidate) => start < candidate.end && end > candidate.start,
  );
  return locator ?? null;
}

function chunksFor(
  parsedText: string,
  map: readonly KnowledgeLocatorV1[],
): ParsedKnowledgeDocument['chunks'] {
  const chunks: ParsedKnowledgeDocument['chunks'][number][] = [];
  const maximum = 2000;
  let cursor = 0;
  let ordinal = 1;
  while (cursor < parsedText.length) {
    while (cursor < parsedText.length && /\s/.test(parsedText[cursor] ?? ''))
      cursor += 1;
    if (cursor >= parsedText.length) break;
    let end = Math.min(parsedText.length, cursor + maximum);
    if (end < parsedText.length) {
      const paragraph = parsedText.lastIndexOf('\n\n', end);
      const sentence = parsedText.lastIndexOf('. ', end);
      const candidate = Math.max(paragraph, sentence);
      if (candidate > cursor + maximum / 2)
        end = candidate + (candidate === sentence ? 1 : 0);
    }
    const text = parsedText.slice(cursor, end).trimEnd();
    const sourceSpanEnd = cursor + text.length;
    if (text.length > 0) {
      chunks.push({
        contentHash: sha256(text),
        locator: locatorFor(cursor, sourceSpanEnd, map),
        ordinal,
        sourceSpanEnd,
        sourceSpanStart: cursor,
        text,
      });
      ordinal += 1;
    }
    cursor = Math.max(end, sourceSpanEnd);
  }
  return chunks;
}

export class LocalKnowledgeSourceParser implements KnowledgeSourceParser {
  public readonly maximumBytes = MAXIMUM_KNOWLEDGE_FILE_BYTES;

  public hashText(text: string): string {
    return sha256(text);
  }

  public async parse(
    upload: KnowledgeUpload,
  ): Promise<ParsedKnowledgeDocument> {
    screenBytes(upload);
    const fileFormat = formatFor(upload);
    const result =
      fileFormat === 'pdf'
        ? await pdfDocument(upload)
        : {
            ...textDocument(upload, fileFormat),
            quality: 'complete' as const,
          };
    return {
      chunks: chunksFor(result.parsedText, result.pageOrSectionMap),
      extractionQuality: result.quality,
      fileFormat,
      originalContentHash: sha256(upload.bytes),
      pageOrSectionMap: result.pageOrSectionMap,
      parsedText: result.parsedText,
      parserId: LOCAL_KNOWLEDGE_PARSER_ID,
      parserVersion: LOCAL_KNOWLEDGE_PARSER_VERSION,
    };
  }
}

const objectReferencePattern = /^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/;

export class LocalContentAddressedKnowledgeStore implements KnowledgeObjectStore {
  private readonly root: string;

  public constructor(root: string) {
    if (!root.trim())
      throw new DomainValidationError(
        'The knowledge object-store root is required.',
      );
    this.root = resolve(root);
  }

  private pathFor(objectRef: string): string {
    if (!objectReferencePattern.test(objectRef))
      throw new DomainValidationError('Knowledge object reference is invalid.');
    const path = resolve(this.root, ...objectRef.split('/'));
    if (!path.startsWith(`${this.root}${sep}`))
      throw new DomainValidationError(
        'Knowledge object reference escaped root.',
      );
    return path;
  }

  public async put(contentHash: string, bytes: Uint8Array): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(contentHash) || sha256(bytes) !== contentHash)
      throw new DomainValidationError('Knowledge object hash is invalid.');
    const objectRef = `sha256/${contentHash.slice(0, 2)}/${contentHash}`;
    const path = this.pathFor(objectRef);
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    try {
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EEXIST'
      )
        throw error;
      const existing = await readFile(path);
      if (sha256(existing) !== contentHash)
        throw new DomainValidationError(
          'Existing knowledge object failed hash validation.',
        );
    }
    return objectRef;
  }

  public async get(objectRef: string): Promise<Uint8Array> {
    const bytes = await readFile(this.pathFor(objectRef));
    const expectedHash = objectRef.split('/').at(-1);
    if (!expectedHash || sha256(bytes) !== expectedHash)
      throw new DomainValidationError(
        'Stored knowledge object failed hash validation.',
      );
    return bytes;
  }
}
