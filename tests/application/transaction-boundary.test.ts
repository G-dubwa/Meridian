import { describe, expect, it } from 'vitest';
import type {
  TransactionManager,
  TransactionPorts,
  UserScope,
} from '../../packages/domain/src/index.js';
import { ApplicationTransactionBoundary } from '../../packages/application/src/index.js';

class InMemoryTransactionManager implements TransactionManager {
  public calls = 0;

  public constructor(private readonly ports: TransactionPorts) {}

  public async run<T>(
    _scope: UserScope,
    operation: (ports: TransactionPorts) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    return operation(this.ports);
  }
}

describe('application transaction boundary', () => {
  it('executes a use-case operation exactly once with in-memory ports', async () => {
    const ports = Object.freeze({}) as TransactionPorts;
    const transactions = new InMemoryTransactionManager(ports);
    const boundary = new ApplicationTransactionBoundary(transactions);
    const scope = {
      userId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01970',
    } as UserScope;

    await expect(
      boundary.execute(scope, (received) =>
        Promise.resolve(received === ports),
      ),
    ).resolves.toBe(true);
    expect(transactions.calls).toBe(1);
  });
});
