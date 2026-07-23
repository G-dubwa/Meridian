import type { NextRequest } from 'next/server';
import { postEdgeRemove } from '../../../../../_server/goal-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ edgeId: string }> },
) {
  const { edgeId } = await context.params;
  return postEdgeRemove(request, edgeId);
}
