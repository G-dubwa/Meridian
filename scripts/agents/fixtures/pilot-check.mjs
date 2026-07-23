import { readFileSync } from 'node:fs';

const marker = readFileSync('docs/qa/pilot-target.md', 'utf8');
if (!marker.includes('# Pilot target')) {
  process.stderr.write('Synthetic pilot marker is malformed.\n');
  process.exit(1);
}
if (/\.env|token|password|cookie|personal data/iu.test(marker)) {
  process.stderr.write('Synthetic pilot marker contains a forbidden term.\n');
  process.exit(1);
}
