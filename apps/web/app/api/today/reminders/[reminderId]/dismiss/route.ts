import type { NextRequest } from 'next/server';
import { postReminderDismiss } from '../../../../../_server/today-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reminderId: string }> },
) {
  const { reminderId } = await context.params;
  return postReminderDismiss(request, reminderId);
}
