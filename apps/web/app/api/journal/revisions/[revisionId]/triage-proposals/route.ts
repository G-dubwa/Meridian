import { postRevisionTriageProposals } from '../../../../../_server/triage-http';

export const dynamic = 'force-dynamic';

export function POST(
  request: Parameters<typeof postRevisionTriageProposals>[0],
  context: { params: Promise<{ revisionId: string }> },
) {
  return context.params.then(({ revisionId }) =>
    postRevisionTriageProposals(request, revisionId),
  );
}
