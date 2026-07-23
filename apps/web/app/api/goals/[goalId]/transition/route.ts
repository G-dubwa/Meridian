import type { NextRequest } from 'next/server';
import { postGoalTransition } from '../../../../_server/goal-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ goalId: string }> },
) {
  const { goalId } = await context.params;
  return postGoalTransition(request, goalId);
}
