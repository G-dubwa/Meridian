import { randomUUID } from 'node:crypto';
import type { ActionService } from '../../packages/application/src/actions.js';
import {
  MICROSOFT_TODO_TEST_TITLE,
  MicrosoftTodoEnablementService,
} from '../../packages/application/src/microsoft-todo-enablement.js';
import type { MicrosoftTodoSpikeService } from '../../packages/application/src/microsoft-todo-spike.js';
import {
  reminderIdV1Schema,
  reminderOccurrenceIdV1Schema,
  userIdV1Schema,
  uuidV1Schema,
} from '../../packages/domain/src/index.js';
import type {
  TransactionManager,
  TransactionPorts,
} from '../../packages/domain/src/index.js';
import { describe, expect, it, vi } from 'vitest';

const scope = {
  userId: userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f02970'),
};
const now = new Date('2026-07-20T16:00:00.000Z');
const reminderId = reminderIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f02971',
);
const occurrenceId = reminderOccurrenceIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f02972',
);

function harness() {
  const createReminder = vi.fn().mockResolvedValue({
    receipt: {},
    target: { id: reminderId },
  });
  const prepareExperimentalList = vi.fn().mockResolvedValue({});
  const createExperimentalTask = vi.fn().mockResolvedValue({});
  const status = vi.fn().mockResolvedValue({
    listStatus: 'experimental',
    reminderAt: '2026-07-22T07:00:00.000Z',
    taskStatus: 'pending',
  });
  const transactions: TransactionManager = {
    run: (_scope, operation) =>
      operation({
        reminderOccurrences: {
          findByReminder: () =>
            Promise.resolve({
              createdAt: now,
              id: occurrenceId,
              reminderId,
              scheduledFor: new Date('2026-07-22T07:00:00.000Z'),
              scope,
              state: 'pending',
              updatedAt: now,
            }),
        },
      } as unknown as TransactionPorts),
  };
  const service = new MicrosoftTodoEnablementService({
    actions: { createReminder } as unknown as ActionService,
    clock: { now: () => now },
    todo: {
      createExperimentalTask,
      prepareExperimentalList,
      status,
    } as unknown as MicrosoftTodoSpikeService,
    transactions,
  });
  return {
    createExperimentalTask,
    createReminder,
    prepareExperimentalList,
    service,
  };
}

describe('WP-11 guarded first-day enablement', () => {
  it('requires preparation margin before creating canonical or external state', async () => {
    const state = harness();
    await expect(
      state.service.createFirstDayTest(
        scope,
        '2026-07-20T16:29:59.000Z',
        uuidV1Schema.parse(randomUUID()),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(state.createReminder).not.toHaveBeenCalled();
    expect(state.prepareExperimentalList).not.toHaveBeenCalled();
  });

  it('creates the canonical synthetic occurrence first and projects only the constant test label', async () => {
    const state = harness();
    const idempotencyKey = uuidV1Schema.parse(randomUUID());
    await expect(
      state.service.createFirstDayTest(
        scope,
        '2026-07-22T07:00:00.000Z',
        idempotencyKey,
      ),
    ).resolves.toEqual({
      listStatus: 'experimental',
      reminderAt: '2026-07-22T07:00:00.000Z',
      taskStatus: 'pending',
    });
    expect(state.createReminder).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        purpose: MICROSOFT_TODO_TEST_TITLE,
        recurrence: null,
        timeZone: 'Africa/Johannesburg',
        triggerAt: '2026-07-22T07:00:00.000Z',
      }),
      { correlationId: idempotencyKey },
    );
    expect(state.prepareExperimentalList).toHaveBeenCalledWith(scope, {
      correlationId: idempotencyKey,
      ownerConfirmed: true,
    });
    expect(state.createExperimentalTask).toHaveBeenCalledWith(
      scope,
      {
        dueAt: null,
        occurrenceId,
        recurrence: null,
        reminderAt: '2026-07-22T07:00:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: MICROSOFT_TODO_TEST_TITLE,
      },
      { correlationId: idempotencyKey, ownerConfirmed: true },
    );
  });
});
