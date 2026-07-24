import type { NextRequest } from 'next/server';
import { postBlockResponse } from '../../../../../_server/execution-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  const { blockId } = await context.params;
  return postBlockResponse(request, blockId);
}
