import type { NextRequest } from 'next/server';
import { postArchiveJournalEntry } from '../../../../../_server/journal-http';

export function POST(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  return context.params.then(({ entryId }) =>
    postArchiveJournalEntry(request, entryId),
  );
}
