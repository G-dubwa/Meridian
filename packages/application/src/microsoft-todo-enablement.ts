import {
  ConflictError,
  MICROSOFT_TODO_TIME_ZONE,
  reminderIdV1Schema,
} from '@meridian/domain';
import type {
  Clock,
  TransactionManager,
  UserScope,
  Uuid,
} from '@meridian/domain';
import type { ActionService } from './actions.js';
import type {
  MicrosoftTodoExperimentalStatus,
  MicrosoftTodoSpikeService,
} from './microsoft-todo-spike.js';

const PREPARATION_MARGIN_MS = 30 * 60 * 1_000;
export const MICROSOFT_TODO_TEST_TITLE =
  'Meridian WP-11 TEST — safe to delete' as const;

export interface MicrosoftTodoEnablementDependencies {
  readonly actions: ActionService;
  readonly clock: Clock;
  readonly todo: MicrosoftTodoSpikeService;
  readonly transactions: TransactionManager;
}

export class MicrosoftTodoEnablementService {
  public constructor(
    private readonly dependencies: MicrosoftTodoEnablementDependencies,
  ) {}

  public async createFirstDayTest(
    scope: UserScope,
    reminderAt: string,
    idempotencyKey: Uuid,
  ): Promise<MicrosoftTodoExperimentalStatus> {
    if (
      Date.parse(reminderAt) <
      this.dependencies.clock.now().getTime() + PREPARATION_MARGIN_MS
    )
      throw new ConflictError(
        'The first-day test requires at least 30 minutes of preparation.',
      );
    const context = { correlationId: idempotencyKey };
    const created = await this.dependencies.actions.createReminder(
      scope,
      {
        authority: {
          ambiguous: false,
          deterministic: true,
          explicit: true,
          externalEffect: false,
          ownerConfirmed: true,
        },
        expiresAt: null,
        priority: 'normal',
        purpose: MICROSOFT_TODO_TEST_TITLE,
        recurrence: null,
        relatedResourceId: null,
        timeZone: MICROSOFT_TODO_TIME_ZONE,
        triggerAt: reminderAt,
      },
      context,
    );
    const occurrence = await this.dependencies.transactions.run(
      scope,
      (ports) =>
        ports.reminderOccurrences.findByReminder(
          scope,
          reminderIdV1Schema.parse(created.target.id),
        ),
    );
    if (!occurrence)
      throw new ConflictError('Canonical reminder occurrence is missing.');
    await this.dependencies.todo.prepareExperimentalList(scope, {
      ...context,
      ownerConfirmed: true,
    });
    await this.dependencies.todo.createExperimentalTask(
      scope,
      {
        dueAt: null,
        occurrenceId: occurrence.id,
        recurrence: null,
        reminderAt,
        timeZone: MICROSOFT_TODO_TIME_ZONE,
        title: MICROSOFT_TODO_TEST_TITLE,
      },
      { ...context, ownerConfirmed: true },
    );
    return this.dependencies.todo.status(scope);
  }
}
