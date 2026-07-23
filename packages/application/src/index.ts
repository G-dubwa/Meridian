import type {
  TransactionManager,
  TransactionPorts,
  UserScope,
} from '@meridian/domain';

export * from './authentication.js';
export * from './goals.js';
export * from './actions.js';
export * from './interpretation.js';
export * from './journal.js';
export * from './microsoft-connection.js';
export * from './model-gateway.js';
export * from './model-routing.js';
export * from './reliable-events.js';
export * from './scheduling.js';
export * from './triage.js';
export * from './today.js';

export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}

export type TransactionalOperation<Output> = (
  ports: TransactionPorts,
) => Promise<Output>;

export class ApplicationTransactionBoundary {
  public constructor(private readonly transactions: TransactionManager) {}

  public execute<Output>(
    scope: UserScope,
    operation: TransactionalOperation<Output>,
  ): Promise<Output> {
    return this.transactions.run(scope, operation);
  }
}

export const applicationContractVersion = 1 as const;
