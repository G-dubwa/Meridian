import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabaseClient } from './client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);
const { database, sql } = createDatabaseClient(connectionString);

try {
  await migrate(database, { migrationsFolder });
} finally {
  await sql.end();
}
