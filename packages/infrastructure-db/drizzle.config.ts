import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './packages/infrastructure-db/migrations',
  schema: './packages/infrastructure-db/src/schema.ts',
  strict: true,
  verbose: true,
});
