import type { NextRequest } from 'next/server';
import { postKnowledgeSourceReview } from '../../../../../_server/knowledge-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await context.params;
  return postKnowledgeSourceReview(request, sourceId);
}
