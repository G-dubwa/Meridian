import { pathToFileURL } from 'node:url';
import {
  workerErrorCodeV1Schema,
  workerObservationV1Schema,
} from '@meridian/domain';
import { createMeridianWorkerRuntime } from './composition.js';

export * from './composition.js';
export * from './runtime.js';

async function main(): Promise<void> {
  const runtime = await createMeridianWorkerRuntime();
  const stop = () => {
    void runtime.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runtime.start();
  } catch (error) {
    await runtime.stop().catch(() => undefined);
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(() => {
    process.stderr.write(
      `${JSON.stringify(
        workerObservationV1Schema.parse({
          errorCode: workerErrorCodeV1Schema.parse('WORKER_STARTUP_FAILURE'),
          name: 'worker.error',
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
        }),
      )}\n`,
    );
    process.exitCode = 1;
  });
}
