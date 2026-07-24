import type { NextRequest } from 'next/server';
import { getKnowledgeSource } from '../../../../_server/knowledge-http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await context.params;
  return getKnowledgeSource(request, sourceId);
}
