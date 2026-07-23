import type { NextRequest } from 'next/server';
import { postTaskComplete } from '../../../../../_server/today-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  return postTaskComplete(request, taskId);
}
