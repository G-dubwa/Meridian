import type { NextRequest } from 'next/server';
import { postKnowledgeClaimReview } from '../../../../../_server/knowledge-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> },
) {
  const { claimId } = await context.params;
  return postKnowledgeClaimReview(request, claimId);
}
