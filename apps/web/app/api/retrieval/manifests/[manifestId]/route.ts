import type { NextRequest } from 'next/server';
import { getContextManifest } from '../../../../_server/retrieval-http';

export const dynamic = 'force-dynamic';

export function GET(
  request: NextRequest,
  context: { params: Promise<{ manifestId: string }> },
) {
  return context.params.then(({ manifestId }) =>
    getContextManifest(request, manifestId),
  );
}
