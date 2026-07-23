import type { NextRequest } from 'next/server';
import { postTodayUndo } from '../../../../../_server/today-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await context.params;
  return postTodayUndo(request, receiptId);
}
