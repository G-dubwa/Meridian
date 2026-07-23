import {
  createEdgeRequestV1Schema,
  createGoalRequestV1Schema,
  edgeResponseV1Schema,
  goalLimitResponseV1Schema,
  goalResponseV1Schema,
  goalSnapshotResponseV1Schema,
  removeEdgeRequestV1Schema,
  transitionGoalRequestV1Schema,
  updateGoalLimitRequestV1Schema,
  updateGoalRequestV1Schema,
} from '@meridian/api-contracts';
import {
  edgeIdV1Schema,
  goalIdV1Schema,
  type EdgeRecord,
  type GoalRecord,
} from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import { taskResponse } from './action-http';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

function goalResponse(goal: GoalRecord) {
  return goalResponseV1Schema.parse({
    createdAt: goal.createdAt.toISOString(),
    creationAuthority: goal.creationAuthority,
    id: goal.id,
    lifeDomain: goal.lifeDomain,
    narrative: goal.narrative,
    resourceId: goal.resourceId,
    sourceProposalId: goal.sourceProposalId,
    state: goal.state,
    successCriteria: goal.successCriteria,
    targetDate: goal.targetDate,
    title: goal.title,
    type: goal.type,
    updatedAt: goal.updatedAt.toISOString(),
    version: goal.version,
  });
}

function edgeResponse(edge: EdgeRecord) {
  return edgeResponseV1Schema.parse({
    createdAt: edge.createdAt.toISOString(),
    edgeType: edge.edgeType,
    id: edge.id,
    removedAt: edge.removedAt?.toISOString() ?? null,
    sourceResourceId: edge.sourceResourceId,
    targetResourceId: edge.targetResourceId,
    updatedAt: edge.updatedAt.toISOString(),
    version: edge.version,
  });
}

export async function getGoals(request: NextRequest): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const snapshot = await authenticationRuntime().goals.get(scope);
    return jsonNoStore(
      goalSnapshotResponseV1Schema.parse({
        blockers: snapshot.blockers,
        edges: snapshot.edges.map(edgeResponse),
        goals: snapshot.goals.map(goalResponse),
        guidance: snapshot.guidance,
        linkedTasks: snapshot.linkedTasks.map(taskResponse),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postGoal(request: NextRequest): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createGoalRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      goalResponse(
        await authenticationRuntime().goals.create(scope, input, context),
      ),
      201,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postGoalEdit(
  request: NextRequest,
  goalId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = updateGoalRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      goalResponse(
        await authenticationRuntime().goals.update(
          scope,
          goalIdV1Schema.parse(goalId),
          input,
          context,
        ),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postGoalTransition(
  request: NextRequest,
  goalId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = transitionGoalRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      goalResponse(
        await authenticationRuntime().goals.transition(
          scope,
          goalIdV1Schema.parse(goalId),
          input,
          context,
        ),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postEdge(request: NextRequest): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createEdgeRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      edgeResponse(
        await authenticationRuntime().goals.createEdge(scope, input, context),
      ),
      201,
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postEdgeRemove(
  request: NextRequest,
  edgeId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = removeEdgeRequestV1Schema.parse(await request.json());
    return jsonNoStore(
      edgeResponse(
        await authenticationRuntime().goals.removeEdge(
          scope,
          edgeIdV1Schema.parse(edgeId),
          input.expectedVersion,
          input.ownerConfirmed,
          context,
        ),
      ),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postGoalLimit(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = updateGoalLimitRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().goals.updateSoftLimit(
      scope,
      input,
      context,
    );
    return jsonNoStore(
      goalLimitResponseV1Schema.parse({
        softActiveGoalLimit: result.softActiveGoalLimit,
        updatedAt: result.updatedAt.toISOString(),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}
