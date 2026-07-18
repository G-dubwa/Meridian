import type { NextRequest } from 'next/server';
import { postJournalRevision } from '../../../../../_server/journal-http';

export function POST(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  return context.params.then(({ entryId }) =>
    postJournalRevision(request, entryId),
  );
}
