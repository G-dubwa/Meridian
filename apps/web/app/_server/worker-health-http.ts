import { workerHealthResponseV1Schema } from '@meridian/api-contracts';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

export async function getWorkerHealth(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const health = await authenticationRuntime().workerHealth.read(scope);
    return jsonNoStore(
      workerHealthResponseV1Schema.parse({
        ...health,
        deadLetters: health.deadLetters.map((letter) => ({
          ...letter,
          createdAt: letter.createdAt.toISOString(),
          deadLetteredAt: letter.deadLetteredAt.toISOString(),
        })),
        oldestUnfinishedAt: health.oldestUnfinishedAt?.toISOString() ?? null,
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
