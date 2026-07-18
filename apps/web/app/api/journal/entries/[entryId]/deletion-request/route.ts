import type { NextRequest } from 'next/server';
import { postJournalDeletionRequest } from '../../../../../_server/journal-http';

export function POST(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  return context.params.then(({ entryId }) =>
    postJournalDeletionRequest(request, entryId),
  );
}
