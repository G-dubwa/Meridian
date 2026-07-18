import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDatabaseClient(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 10,
    onnotice: () => undefined,
    prepare: false,
  });
  return { database: drizzle(sql, { schema }), sql };
}

export type DatabaseClient = ReturnType<
  typeof createDatabaseClient
>['database'];
