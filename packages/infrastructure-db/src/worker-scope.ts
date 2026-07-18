import type { UserScope } from '@meridian/domain';
import { userIdV1Schema } from '@meridian/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseClient } from './client.js';
import { authCredentials } from './schema.js';

export async function findOwnerWorkerScope(
  database: DatabaseClient,
): Promise<UserScope | null> {
  const [row] = await database
    .select({ userId: authCredentials.userId })
    .from(authCredentials)
    .where(eq(authCredentials.singleton, true))
    .limit(1);
  return row ? { userId: userIdV1Schema.parse(row.userId) } : null;
}
