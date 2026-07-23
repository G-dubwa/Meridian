import { postSchedulingDecision } from '../../../../_server/scheduling-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Parameters<typeof postSchedulingDecision>[0],
  context: { params: Promise<{ proposalId: string }> },
) {
  return postSchedulingDecision(
    request,
    (await context.params).proposalId,
    'dismiss',
  );
}
