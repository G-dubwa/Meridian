import type {
  CreateJournalEntryRequestV1,
  JournalActivityResponseV1,
  JournalEntryListResponseV1,
  JournalEntryResponseV1,
  ReviseJournalEntryRequestV1,
} from './journal.js';
import {
  journalActivityResponseV1Schema,
  journalEntryListResponseV1Schema,
  journalEntryResponseV1Schema,
} from './journal.js';

export type JournalFetchV1 = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class JournalApiErrorV1 extends Error {
  public constructor(public readonly status: number) {
    super(`Journal API request failed with status ${String(status)}.`);
    this.name = 'JournalApiErrorV1';
  }
}

export interface JournalCommandOptionsV1 {
  readonly correlationId?: string;
}

async function parseResponse<T>(
  pendingResponse: Promise<Response> | Response,
  parse: (value: unknown) => T,
): Promise<T> {
  const response = await pendingResponse;
  if (!response.ok) throw new JournalApiErrorV1(response.status);
  return parse(await response.json());
}

function commandInit(
  body: Readonly<Record<string, unknown>>,
  csrfToken: string,
  correlationId: string = globalThis.crypto.randomUUID(),
): RequestInit {
  return {
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-request-id': correlationId,
    },
    method: 'POST',
  };
}

export interface JournalApiClientV1 {
  listEntries(): Promise<JournalEntryListResponseV1>;
  getEntry(entryId: string): Promise<JournalEntryResponseV1>;
  createEntry(
    input: CreateJournalEntryRequestV1,
    csrfToken: string,
    options?: JournalCommandOptionsV1,
  ): Promise<JournalEntryResponseV1>;
  reviseEntry(
    entryId: string,
    input: ReviseJournalEntryRequestV1,
    csrfToken: string,
    options?: JournalCommandOptionsV1,
  ): Promise<JournalEntryResponseV1>;
  archiveEntry(
    entryId: string,
    expectedVersion: number,
    csrfToken: string,
    options?: JournalCommandOptionsV1,
  ): Promise<JournalEntryResponseV1>;
  requestHardDeletion(
    entryId: string,
    expectedVersion: number,
    csrfToken: string,
    options?: JournalCommandOptionsV1,
  ): Promise<JournalEntryResponseV1>;
  listActivity(): Promise<JournalActivityResponseV1>;
}

export function createJournalApiClientV1(
  fetcher: JournalFetchV1 = globalThis.fetch,
): JournalApiClientV1 {
  const get = (path: string) =>
    fetcher(path, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  const mutate = (
    path: string,
    body: Readonly<Record<string, unknown>>,
    csrfToken: string,
    options?: JournalCommandOptionsV1,
  ) => fetcher(path, commandInit(body, csrfToken, options?.correlationId));
  return {
    archiveEntry: (entryId, expectedVersion, csrfToken, options) =>
      parseResponse(
        mutate(
          `/api/journal/entries/${entryId}/archive`,
          { expectedVersion },
          csrfToken,
          options,
        ),
        (value) => journalEntryResponseV1Schema.parse(value),
      ),
    createEntry: (input, csrfToken, options) =>
      parseResponse(
        mutate('/api/journal/entries', input, csrfToken, options),
        (value) => journalEntryResponseV1Schema.parse(value),
      ),
    getEntry: (entryId) =>
      parseResponse(get(`/api/journal/entries/${entryId}`), (value) =>
        journalEntryResponseV1Schema.parse(value),
      ),
    listActivity: () =>
      parseResponse(get('/api/journal/activity'), (value) =>
        journalActivityResponseV1Schema.parse(value),
      ),
    listEntries: () =>
      parseResponse(get('/api/journal/entries'), (value) =>
        journalEntryListResponseV1Schema.parse(value),
      ),
    requestHardDeletion: (entryId, expectedVersion, csrfToken, options) =>
      parseResponse(
        mutate(
          `/api/journal/entries/${entryId}/deletion-request`,
          { confirmHardDeletion: true, expectedVersion },
          csrfToken,
          options,
        ),
        (value) => journalEntryResponseV1Schema.parse(value),
      ),
    reviseEntry: (entryId, input, csrfToken, options) =>
      parseResponse(
        mutate(
          `/api/journal/entries/${entryId}/revisions`,
          input,
          csrfToken,
          options,
        ),
        (value) => journalEntryResponseV1Schema.parse(value),
      ),
  };
}
