import {
  calendarBlockResponseV1Schema,
  createSchedulingProposalRequestV1Schema,
  schedulingProposalDecisionRequestV1Schema,
  schedulingProposalResponseV1Schema,
  schedulingSnapshotResponseV1Schema,
} from '@meridian/api-contracts';
import { schedulingProposalIdV1Schema } from '@meridian/domain';
import type {
  CalendarBlockRecord,
  SchedulingProposalRecord,
} from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import { taskResponse } from './action-http';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';
import { goalResponse } from './goal-http';

function proposalResponse(record: SchedulingProposalRecord) {
  return schedulingProposalResponseV1Schema.parse({
    alternatives: record.alternatives,
    bufferMinutes: record.bufferMinutes,
    candidates: record.candidates,
    capacityMinutes: record.capacityMinutes,
    createdAt: record.createdAt.toISOString(),
    deadline: record.deadline.toISOString(),
    earliestStart: record.earliestStart.toISOString(),
    estimatedEffortMinutes: record.estimatedEffortMinutes,
    exclusions: record.exclusions,
    goalId: record.goalId,
    id: record.id,
    maxBlockMinutes: record.maxBlockMinutes,
    maxDeepWorkMinutesPerDay: record.maxDeepWorkMinutesPerDay,
    minBlockMinutes: record.minBlockMinutes,
    scheduledMinutes: record.scheduledMinutes,
    state: record.state,
    taskId: record.taskId,
    timeZone: record.timeZone,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
    verdict: record.verdict,
    version: record.version,
    workingWindows: record.workingWindows.map((window) => ({
      endsAt: window.endsAt.toISOString(),
      startsAt: window.startsAt.toISOString(),
    })),
  });
}

export function blockResponse(record: CalendarBlockRecord) {
  return calendarBlockResponseV1Schema.parse({
    approvalRecordedAt: record.approvalRecordedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    currentEndsAt: record.currentEndsAt.toISOString(),
    currentStartsAt: record.currentStartsAt.toISOString(),
    goalId: record.goalId,
    id: record.id,
    ordinal: record.ordinal,
    originalEndsAt: record.originalEndsAt.toISOString(),
    originalStartsAt: record.originalStartsAt.toISOString(),
    plannedEffortMinutes: record.plannedEffortMinutes,
    proposalId: record.proposalId,
    resourceId: record.resourceId,
    state: record.state,
    taskId: record.taskId,
    timeZone: record.timeZone,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}

export async function getScheduling(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const snapshot = await authenticationRuntime().scheduling.get(scope);
    return jsonNoStore(
      schedulingSnapshotResponseV1Schema.parse({
        blocks: snapshot.blocks.map(blockResponse),
        goals: snapshot.goals.map(goalResponse),
        proposals: snapshot.proposals.map(proposalResponse),
        providerStatus: snapshot.providerStatus,
        tasks: snapshot.tasks.map(taskResponse),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postSchedulingProposal(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createSchedulingProposalRequestV1Schema.parse(
      await request.json(),
    );
    return jsonNoStore(
      proposalResponse(
        await authenticationRuntime().scheduling.create(scope, input, context),
      ),
      201,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postSchedulingDecision(
  request: NextRequest,
  proposalId: string,
  decision: 'accept' | 'dismiss',
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = schedulingProposalDecisionRequestV1Schema.parse(
      await request.json(),
    );
    const id = schedulingProposalIdV1Schema.parse(proposalId);
    const result =
      decision === 'accept'
        ? await authenticationRuntime().scheduling.accept(
            scope,
            id,
            input,
            context,
          )
        : await authenticationRuntime().scheduling.dismiss(
            scope,
            id,
            input,
            context,
          );
    return jsonNoStore(proposalResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}
