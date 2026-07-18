import {
  createJournalEntryRequestV1Schema,
  journalActivityResponseV1Schema,
  journalEntryListResponseV1Schema,
  journalEntryResponseV1Schema,
  journalHardDeletionRequestV1Schema,
  journalLifecycleRequestV1Schema,
  reviseJournalEntryRequestV1Schema,
} from '@meridian/api-contracts';
import type { JournalEntryView } from '@meridian/application';
import { entryIdV1Schema } from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function summary(view: JournalEntryView) {
  return {
    bodyMarkdown: view.currentRevision.bodyMarkdown,
    id: view.entry.id,
    occurredAt: view.currentRevision.occurredAt.toISOString(),
    processingClass: view.currentRevision.processingClass,
    status: view.entry.status,
    updatedAt: view.entry.updatedAt.toISOString(),
    version: view.entry.version,
  };
}

function responseFor(view: JournalEntryView) {
  return journalEntryResponseV1Schema.parse({
    entry: summary(view),
    revisions: view.revisions.map((revision) => ({
      bodyMarkdown: revision.bodyMarkdown,
      changeKind: revision.changeKind,
      createdAt: revision.createdAt.toISOString(),
      createdBy: revision.createdBy,
      id: revision.id,
      occurredAt: revision.occurredAt.toISOString(),
      processingClass: revision.processingClass,
      revisionNumber: revision.revisionNumber,
    })),
  });
}

export async function getJournalEntries(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const views = await authenticationRuntime().journal.listEntries(scope);
    return jsonNoStore(
      journalEntryListResponseV1Schema.parse({
        entries: views.map(summary),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postJournalEntry(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createJournalEntryRequestV1Schema.parse(await request.json());
    const view = await authenticationRuntime().journal.createEntry(
      scope,
      {
        bodyMarkdown: input.bodyMarkdown,
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
        processingClass: input.processingClass,
      },
      context,
    );
    return jsonNoStore(responseFor(view), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function getJournalEntry(
  request: NextRequest,
  entryId: string,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const view = await authenticationRuntime().journal.getEntry(
      scope,
      entryIdV1Schema.parse(entryId),
    );
    return jsonNoStore(responseFor(view));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postJournalRevision(
  request: NextRequest,
  entryId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = reviseJournalEntryRequestV1Schema.parse(await request.json());
    const view = await authenticationRuntime().journal.reviseEntry(
      scope,
      entryIdV1Schema.parse(entryId),
      {
        bodyMarkdown: input.bodyMarkdown,
        expectedVersion: input.expectedVersion,
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
        processingClass: input.processingClass,
      },
      context,
    );
    return jsonNoStore(responseFor(view));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

async function transition(
  request: NextRequest,
  entryId: string,
  operation: 'archive' | 'delete',
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const requestBody: unknown = await request.json();
    const input =
      operation === 'delete'
        ? journalHardDeletionRequestV1Schema.parse(requestBody)
        : journalLifecycleRequestV1Schema.parse(requestBody);
    const parsedEntryId = entryIdV1Schema.parse(entryId);
    const view =
      operation === 'archive'
        ? await authenticationRuntime().journal.archiveEntry(
            scope,
            parsedEntryId,
            input.expectedVersion,
            context,
          )
        : await authenticationRuntime().journal.requestHardDeletion(
            scope,
            parsedEntryId,
            input.expectedVersion,
            context,
          );
    return jsonNoStore(responseFor(view));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export function postArchiveJournalEntry(
  request: NextRequest,
  entryId: string,
): Promise<NextResponse> {
  return transition(request, entryId, 'archive');
}

export function postJournalDeletionRequest(
  request: NextRequest,
  entryId: string,
): Promise<NextResponse> {
  return transition(request, entryId, 'delete');
}

export async function getJournalActivity(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const activity = await authenticationRuntime().journal.listActivity(scope);
    return jsonNoStore(
      journalActivityResponseV1Schema.parse({
        activity: activity.map((event) => ({
          entryId: entryIdV1Schema.parse(event.aggregateId),
          eventId: event.eventId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
        })),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
