import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  [
    'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
    'scripts/fixtures/packages',
    '--config',
    'dependency-cruiser.config.mjs',
    '--validate',
  ],
  { encoding: 'utf8' },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const expectedRules = [
  'application-does-not-import-adapters',
  'domain-has-no-outward-dependencies',
];
if (
  result.status === 0 ||
  expectedRules.some((rule) => !output.includes(rule))
) {
  console.error(
    'Dependency rules failed to reject every prohibited import fixture.',
  );
  process.exit(1);
}

console.log('Dependency negative fixture rejected as expected.');
