import type { NextRequest } from 'next/server';
import { getJournalEntry } from '../../../../_server/journal-http';

export function GET(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  return context.params.then(({ entryId }) =>
    getJournalEntry(request, entryId),
  );
}
