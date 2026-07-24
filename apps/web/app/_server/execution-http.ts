import {
  executionRecordResponseV1Schema,
  postBlockConfirmationRequestV1Schema,
  reconcileElapsedRequestV1Schema,
  reconcileElapsedResponseV1Schema,
  weeklyReviewRequestV1Schema,
  weeklyReviewResponseV1Schema,
} from '@meridian/api-contracts';
import type { ExecutionRecord } from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';
import { blockResponse } from './scheduling-http';

function recordResponse(record: ExecutionRecord) {
  return executionRecordResponseV1Schema.parse({
    calendarBlockId: record.calendarBlockId,
    confidenceClass: record.confidenceClass,
    evidenceType: record.evidenceType,
    id: record.id,
    occurredAt: record.occurredAt.toISOString(),
    outcome: record.outcome,
    recordedAt: record.recordedAt.toISOString(),
    reportedDurationMinutes: record.reportedDurationMinutes,
    retractedAt: record.retractedAt?.toISOString() ?? null,
    source: record.source,
    sourceReceiptId: record.sourceReceiptId,
    taskId: record.taskId,
  });
}

export async function getWeeklyReview(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const query = weeklyReviewRequestV1Schema.parse({
      timeZone: request.nextUrl.searchParams.get('timeZone'),
      weekStartsOn: request.nextUrl.searchParams.get('weekStartsOn'),
    });
    const review = await authenticationRuntime().execution.weekly(scope, query);
    return jsonNoStore(
      weeklyReviewResponseV1Schema.parse({
        ...review,
        inbox: review.inbox.map((item) => ({
          block: blockResponse(item.block),
          record: item.record ? recordResponse(item.record) : null,
          status: item.status,
        })),
        weekEndsBefore: review.weekEndsBefore.toISOString(),
        weekStartsAt: review.weekStartsAt.toISOString(),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postBlockResponse(
  request: NextRequest,
  blockId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = postBlockConfirmationRequestV1Schema.parse(
      await request.json(),
    );
    const record = await authenticationRuntime().execution.respondToBlock(
      scope,
      blockId,
      input,
      context,
    );
    return jsonNoStore(recordResponse(record), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postElapsedReconciliation(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = reconcileElapsedRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      reconcileElapsedResponseV1Schema.parse(
        await authenticationRuntime().execution.reconcileElapsed(
          scope,
          input,
          context,
        ),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
