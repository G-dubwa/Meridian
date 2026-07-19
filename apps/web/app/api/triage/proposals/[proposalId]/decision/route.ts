import { postTriageDecision } from '../../../../../_server/triage-http';

export const dynamic = 'force-dynamic';

export function POST(
  request: Parameters<typeof postTriageDecision>[0],
  context: { params: Promise<{ proposalId: string }> },
) {
  return context.params.then(({ proposalId }) =>
    postTriageDecision(request, proposalId),
  );
}
