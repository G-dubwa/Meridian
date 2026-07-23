import type { NextRequest } from 'next/server';
import { postAgendaSettle } from '../../../../../_server/today-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agendaBlockId: string }> },
) {
  const { agendaBlockId } = await context.params;
  return postAgendaSettle(request, agendaBlockId, 'cancelled');
}
