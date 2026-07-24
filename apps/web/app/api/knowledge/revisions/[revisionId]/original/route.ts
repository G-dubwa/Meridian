import type { NextRequest } from 'next/server';
import { getKnowledgeOriginal } from '../../../../../_server/knowledge-http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ revisionId: string }> },
) {
  const { revisionId } = await context.params;
  return getKnowledgeOriginal(request, revisionId);
}
