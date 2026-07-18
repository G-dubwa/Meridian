import type { TransactionManager, TransactionPorts } from '@meridian/domain';

export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}

export type TransactionalOperation<Output> = (
  ports: TransactionPorts,
) => Promise<Output>;

export class ApplicationTransactionBoundary {
  public constructor(private readonly transactions: TransactionManager) {}

  public execute<Output>(
    operation: TransactionalOperation<Output>,
  ): Promise<Output> {
    return this.transactions.run(operation);
  }
}

export const applicationContractVersion = 1 as const;
