import {
  agendaBlockResponseV1Schema,
  createAgendaBlockRequestV1Schema,
  selectDailyPriorityRequestV1Schema,
  todayLifecycleRequestV1Schema,
  todayReceiptResponseV1Schema,
  todaySnapshotResponseV1Schema,
  todayUndoRequestV1Schema,
  updateAgendaBlockRequestV1Schema,
} from '@meridian/api-contracts';
import {
  agendaBlockIdV1Schema,
  localDateV1Schema,
  reminderIdV1Schema,
  taskIdV1Schema,
  timeZoneV1Schema,
  todayReceiptIdV1Schema,
} from '@meridian/domain';
import type { AgendaBlockRecord, TodayReceiptRecord } from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { receiptResponse, reminderResponse, taskResponse } from './action-http';
import { authenticationRuntime } from './composition';

function agendaResponse(record: AgendaBlockRecord) {
  return agendaBlockResponseV1Schema.parse({
    createdAt: record.createdAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    id: record.id,
    notes: record.notes,
    resourceId: record.resourceId,
    startsAt: record.startsAt.toISOString(),
    state: record.state,
    timeZone: record.timeZone,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}

function lifecycleReceiptResponse(record: TodayReceiptRecord) {
  return todayReceiptResponseV1Schema.parse({
    action: record.action,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    status: record.status,
    targetResourceId: record.targetResourceId,
    targetType: record.targetType,
    undoneAt: record.undoneAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}

export async function getToday(request: NextRequest): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const localDate = localDateV1Schema.parse(
      request.nextUrl.searchParams.get('date'),
    );
    const timeZone = timeZoneV1Schema.parse(
      request.nextUrl.searchParams.get('timeZone'),
    );
    const snapshot = await authenticationRuntime().today.get(
      scope,
      localDate,
      timeZone,
    );
    return jsonNoStore(
      todaySnapshotResponseV1Schema.parse({
        agendaBlocks: snapshot.agendaBlocks.map(agendaResponse),
        channel: snapshot.channel,
        localDate: snapshot.localDate,
        priorities: snapshot.priorities.map((item) => ({
          createdAt: item.createdAt.toISOString(),
          id: item.id,
          localDate: item.localDate,
          position: item.position,
          taskId: item.taskId,
          updatedAt: item.updatedAt.toISOString(),
          version: item.version,
        })),
        reminders: snapshot.reminders.map((item) => ({
          receipt: item.receipt ? receiptResponse(item.receipt) : null,
          reminder: reminderResponse(item.reminder),
        })),
        tasks: snapshot.tasks.map((item) => ({
          receipt: item.receipt ? receiptResponse(item.receipt) : null,
          task: taskResponse(item.task),
        })),
        timeZone: snapshot.timeZone,
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postAgenda(request: NextRequest): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createAgendaBlockRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.createAgendaBlock(
      scope,
      input,
      context,
    );
    return jsonNoStore(agendaResponse(result), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postAgendaEdit(
  request: NextRequest,
  agendaBlockId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = updateAgendaBlockRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.updateAgendaBlock(
      scope,
      agendaBlockIdV1Schema.parse(agendaBlockId),
      input,
      context,
    );
    return jsonNoStore(agendaResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postPriority(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = selectDailyPriorityRequestV1Schema.parse(
      await request.json(),
    );
    const result = await authenticationRuntime().today.selectPriority(
      scope,
      input,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postTaskComplete(
  request: NextRequest,
  taskId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = todayLifecycleRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.completeTask(
      scope,
      taskIdV1Schema.parse(taskId),
      input.expectedVersion,
      input.ownerConfirmed,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postReminderComplete(
  request: NextRequest,
  reminderId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = todayLifecycleRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.completeReminder(
      scope,
      reminderIdV1Schema.parse(reminderId),
      input.expectedVersion,
      input.ownerConfirmed,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postReminderDismiss(
  request: NextRequest,
  reminderId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = todayLifecycleRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.dismissReminder(
      scope,
      reminderIdV1Schema.parse(reminderId),
      input.expectedVersion,
      input.ownerConfirmed,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postAgendaSettle(
  request: NextRequest,
  agendaBlockId: string,
  nextState: 'completed' | 'cancelled',
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = todayLifecycleRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.settleAgendaBlock(
      scope,
      agendaBlockIdV1Schema.parse(agendaBlockId),
      input.expectedVersion,
      input.ownerConfirmed,
      nextState,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postTodayUndo(
  request: NextRequest,
  receiptId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = todayUndoRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().today.undo(
      scope,
      todayReceiptIdV1Schema.parse(receiptId),
      input.expectedVersion,
      input.ownerConfirmed,
      context,
    );
    return jsonNoStore(lifecycleReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}
