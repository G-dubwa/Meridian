import { z } from 'zod';
import { userIdV1Schema } from './ids.js';

export const userScopeV1Schema = z.object({ userId: userIdV1Schema }).strict();
export type UserScope = z.infer<typeof userScopeV1Schema>;
