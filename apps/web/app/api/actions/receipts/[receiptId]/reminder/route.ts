import type { NextRequest } from 'next/server';
import { postReminderEdit } from '../../../../../_server/action-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await context.params;
  return postReminderEdit(request, receiptId);
}
