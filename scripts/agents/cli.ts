import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from './supervisor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value && !value.startsWith('--')) return value;
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  return inline ? inline.slice(name.length + 1) : null;
}

function positional(index: number): string | null {
  return process.argv[index] ?? null;
}

function required(value: string | null, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

async function main(): Promise<void> {
  const command = positional(2);
  const supervisor = new Supervisor(root);
  switch (command) {
    case 'doctor': {
      const report = await supervisor.doctor();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.ready) process.exitCode = 1;
      return;
    }
    case 'deliver': {
      const runId = required(
        positional(3),
        'Usage: pnpm agents:deliver <RUN-ID>',
      );
      await supervisor.deliver(runId);
      process.stdout.write(
        `${JSON.stringify({ delivered: true, runId }, null, 2)}\n`,
      );
      return;
    }
    case 'plan': {
      const workPackageId = required(
        option('--wp'),
        'Usage: pnpm agents:plan --wp <WORK-PACKAGE-ID>',
      );
      process.stdout.write(
        `${JSON.stringify(await supervisor.plan(workPackageId), null, 2)}\n`,
      );
      return;
    }
    case 'run': {
      const runId = option('--run');
      const workPackageId = option('--wp');
      const run = runId
        ? supervisor.load(runId)
        : await supervisor.plan(
            required(
              workPackageId,
              'Usage: pnpm agents:run --wp <WORK-PACKAGE-ID> or --run <RUN-ID>',
            ),
          );
      process.stdout.write(
        `${JSON.stringify(await supervisor.run(run.runId), null, 2)}\n`,
      );
      return;
    }
    case 'resume': {
      const runId = required(
        positional(3),
        'Usage: pnpm agents:resume <RUN-ID>',
      );
      process.stdout.write(
        `${JSON.stringify(await supervisor.run(runId), null, 2)}\n`,
      );
      return;
    }
    case 'stop': {
      const runId = required(positional(3), 'Usage: pnpm agents:stop <RUN-ID>');
      process.stdout.write(
        `${JSON.stringify(supervisor.requestStop(runId), null, 2)}\n`,
      );
      return;
    }
    case 'report': {
      const runId = required(
        positional(3),
        'Usage: pnpm agents:report <RUN-ID>',
      );
      process.stdout.write(`${supervisor.report(runId)}\n`);
      return;
    }
    case 'status': {
      const runId = positional(3);
      if (runId) {
        process.stdout.write(
          `${JSON.stringify(supervisor.load(runId), null, 2)}\n`,
        );
        return;
      }
      const runRoot = resolve(root, '.agents/runs');
      const runs = existsSync(runRoot)
        ? readdirSync(runRoot)
            .filter((entry) =>
              existsSync(resolve(runRoot, entry, 'state.json')),
            )
            .map((entry) => supervisor.load(entry))
        : [];
      process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
      return;
    }
    case 'pilot': {
      const live = process.argv.includes('--live');
      if (live) {
        const rawCost = required(
          option('--max-cost-usd'),
          'Live pilot requires --max-cost-usd <AMOUNT>.',
        );
        const costCeilingUsd = Number(rawCost);
        if (!process.argv.includes('--confirm-paid-pilot'))
          throw new Error(
            'Live pilot requires the literal --confirm-paid-pilot gate.',
          );
        const planned = await supervisor.plan('INFRA-PILOT', {
          baseReference: 'HEAD',
          costCeilingUsd,
          ownerConfirmedPaidPilot: true,
          pilotMode: false,
        });
        try {
          const completed = await supervisor.run(planned.runId);
          process.stdout.write(`${supervisor.report(completed.runId)}\n`);
        } finally {
          const current = supervisor.load(planned.runId);
          if (
            ['READY_TO_MERGE', 'FAILED', 'HUMAN_GATE'].includes(current.state)
          )
            await supervisor.cleanup(planned.runId);
        }
        return;
      }
      const planned = await supervisor.plan('INFRA-PILOT', {
        pilotMode: true,
      });
      await supervisor.run(planned.runId, { pauseAt: 'CODEX_REPAIR' });
      const resumed = await new Supervisor(root).run(planned.runId);
      await supervisor.cleanup(planned.runId);
      process.stdout.write(`${supervisor.report(resumed.runId)}\n`);
      return;
    }
    default:
      throw new Error(
        'Usage: pnpm agents:<doctor|plan|run|status|resume|stop|report|pilot|deliver>',
      );
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  process.stderr.write(`Agent supervisor failed safely: ${message}\n`);
  process.exitCode = 1;
});
