import type { NextRequest } from 'next/server';
import { postKnowledgeSourceDeletionRequest } from '../../../../../_server/knowledge-http';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await context.params;
  return postKnowledgeSourceDeletionRequest(request, sourceId);
}
