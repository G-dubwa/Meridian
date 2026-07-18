import type {
  TransactionManager,
  TransactionPorts,
  UserScope,
} from '@meridian/domain';

export * from './authentication.js';
export * from './journal.js';
export * from './reliable-events.js';

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
