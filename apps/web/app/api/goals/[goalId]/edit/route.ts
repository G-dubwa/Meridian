import type { NextRequest } from 'next/server';
import { postGoalEdit } from '../../../../_server/goal-http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ goalId: string }> },
) {
  const { goalId } = await context.params;
  return postGoalEdit(request, goalId);
}
