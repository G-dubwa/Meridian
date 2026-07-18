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
if (
  result.status === 0 ||
  !output.includes('domain-has-no-outward-dependencies')
) {
  console.error(
    'Dependency rules failed to reject the domain-to-infrastructure fixture.',
  );
  process.exit(1);
}

console.log('Dependency negative fixture rejected as expected.');
