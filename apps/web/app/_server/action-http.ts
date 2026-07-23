import {
  actionListResponseV1Schema,
  actionReceiptResponseV1Schema,
  createReminderRequestV1Schema,
  createTaskRequestV1Schema,
  editReminderReceiptRequestV1Schema,
  editTaskReceiptRequestV1Schema,
  explicitReminderCommandRequestV1Schema,
  undoCommandReceiptRequestV1Schema,
} from '@meridian/api-contracts';
import {
  commandReceiptIdV1Schema,
  type CommandReceiptRecord,
  type ReminderRecord,
  type TaskRecord,
} from '@meridian/domain';
import type { NextRequest, NextResponse } from 'next/server';
import {
  httpErrorResponse,
  jsonNoStore,
  requireAuthenticatedScope,
} from './auth-http';
import { authenticationRuntime } from './composition';

export function taskResponse(task: TaskRecord) {
  return {
    createdAt: task.createdAt.toISOString(),
    creationAuthority: task.creationAuthority,
    dueAt: task.dueAt?.toISOString() ?? null,
    estimateMinutes: task.estimateMinutes,
    goalResourceId: task.goalResourceId,
    id: task.id,
    kind: task.kind,
    notes: task.notes,
    resourceId: task.resourceId,
    sourceProposalId: task.sourceProposalId,
    state: task.state,
    title: task.title,
    updatedAt: task.updatedAt.toISOString(),
    version: task.version,
  };
}

export function reminderResponse(reminder: ReminderRecord) {
  return {
    createdAt: reminder.createdAt.toISOString(),
    creationAuthority: reminder.creationAuthority,
    deliveryPolicy: reminder.deliveryPolicy,
    expiresAt: reminder.expiresAt?.toISOString() ?? null,
    id: reminder.id,
    ownerFeedback: reminder.ownerFeedback,
    priority: reminder.priority,
    purpose: reminder.purpose,
    quietHoursBehavior: reminder.quietHoursBehavior,
    recurrence: reminder.recurrence,
    relatedResourceId: reminder.relatedResourceId,
    resourceId: reminder.resourceId,
    sourceProposalId: reminder.sourceProposalId,
    state: reminder.state,
    timeZone: reminder.timeZone,
    triggerAt: reminder.triggerAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
    version: reminder.version,
  };
}

export function receiptResponse(receipt: CommandReceiptRecord) {
  return {
    createdAt: receipt.createdAt.toISOString(),
    id: receipt.id,
    status: receipt.status,
    targetResourceId: receipt.targetResourceId,
    targetType: receipt.targetType,
    undoneAt: receipt.undoneAt?.toISOString() ?? null,
    updatedAt: receipt.updatedAt.toISOString(),
    version: receipt.version,
  };
}

export function actionReceiptResponse(result: {
  readonly receipt: CommandReceiptRecord;
  readonly target: TaskRecord | ReminderRecord;
}) {
  return actionReceiptResponseV1Schema.parse({
    receipt: receiptResponse(result.receipt),
    target:
      result.receipt.targetType === 'task'
        ? {
            targetType: 'task',
            task: taskResponse(result.target as TaskRecord),
          }
        : {
            reminder: reminderResponse(result.target as ReminderRecord),
            targetType: 'reminder',
          },
  });
}

export async function getActions(request: NextRequest): Promise<NextResponse> {
  try {
    const { scope } = await requireAuthenticatedScope(request);
    const result = await authenticationRuntime().actions.list(scope);
    return jsonNoStore(
      actionListResponseV1Schema.parse({
        reminders: result.reminders.map(reminderResponse),
        tasks: result.tasks.map(taskResponse),
      }),
    );
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postTask(request: NextRequest): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createTaskRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().actions.createTask(
      scope,
      input,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postReminder(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = createReminderRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().actions.createReminder(
      scope,
      input,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postReminderCommand(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = explicitReminderCommandRequestV1Schema.parse(
      await request.json(),
    );
    const result = await authenticationRuntime().actions.createReminderCommand(
      scope,
      input,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result), 201);
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postUndo(
  request: NextRequest,
  receiptId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = undoCommandReceiptRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().actions.undo(
      scope,
      commandReceiptIdV1Schema.parse(receiptId),
      input.expectedVersion,
      input.ownerConfirmed,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postTaskEdit(
  request: NextRequest,
  receiptId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = editTaskReceiptRequestV1Schema.parse(await request.json());
    const result = await authenticationRuntime().actions.editTask(
      scope,
      commandReceiptIdV1Schema.parse(receiptId),
      input,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}

export async function postReminderEdit(
  request: NextRequest,
  receiptId: string,
): Promise<NextResponse> {
  try {
    const { context, scope } = await requireAuthenticatedScope(request, true);
    const input = editReminderReceiptRequestV1Schema.parse(
      await request.json(),
    );
    const result = await authenticationRuntime().actions.editReminder(
      scope,
      commandReceiptIdV1Schema.parse(receiptId),
      input,
      context,
    );
    return jsonNoStore(actionReceiptResponse(result));
  } catch (error) {
    return httpErrorResponse(error);
  }
}
