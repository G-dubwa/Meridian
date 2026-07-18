import { describe, expect, it } from 'vitest';
import type {
  TransactionManager,
  TransactionPorts,
} from '../../packages/domain/src/index.js';
import { ApplicationTransactionBoundary } from '../../packages/application/src/index.js';

class InMemoryTransactionManager implements TransactionManager {
  public calls = 0;

  public constructor(private readonly ports: TransactionPorts) {}

  public async run<T>(
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

    await expect(
      boundary.execute((received) => Promise.resolve(received === ports)),
    ).resolves.toBe(true);
    expect(transactions.calls).toBe(1);
  });
});
