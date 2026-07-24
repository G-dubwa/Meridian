import {
  authIdentifierV1Schema,
  authPassphraseV1Schema,
  authorityTierV1Schema,
  domainEventEnvelopeV1Schema,
  processingClassV1Schema,
  recoveryCodeV1Schema,
  userScopeV1Schema,
} from '@meridian/domain';
import { z } from 'zod';
import { workerHealthResponseV1Schema } from './worker-health.js';
import { microsoftConnectionStatusResponseV1Schema } from './microsoft-integration.js';

export * from './journal-client.js';
export * from './actions.js';
export * from './goals.js';
export * from './execution.js';
export * from './journal.js';
export * from './knowledge.js';
export * from './microsoft-integration.js';
export * from './scheduling.js';
export * from './worker-health.js';

export const csrfResponseV1Schema = z
  .object({ csrfToken: z.string().min(32).max(256) })
  .strict();

export const loginRequestV1Schema = z
  .object({
    identifier: authIdentifierV1Schema,
    passphrase: authPassphraseV1Schema,
  })
  .strict();

export const recoveryLoginRequestV1Schema = z
  .object({
    identifier: authIdentifierV1Schema,
    recoveryCode: recoveryCodeV1Schema,
  })
  .strict();

export const authenticationResponseV1Schema = z
  .object({
    authenticated: z.literal(true),
    absoluteExpiresAt: z.iso.datetime({ offset: true }),
    idleExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const sessionResponseV1Schema = z
  .object({
    authenticated: z.literal(true),
    identifier: authIdentifierV1Schema,
    activeSessionCount: z.number().int().nonnegative(),
    absoluteExpiresAt: z.iso.datetime({ offset: true }),
    idleExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const changePasswordRequestV1Schema = z
  .object({
    currentPassphrase: authPassphraseV1Schema,
    newPassphrase: authPassphraseV1Schema,
  })
  .strict();

export const revokeSessionsRequestV1Schema = z
  .object({ includeCurrent: z.boolean() })
  .strict();

export const authenticationErrorResponseV1Schema = z
  .object({
    error: z.enum([
      'AUTHENTICATION_FAILED',
      'CONFLICT',
      'CSRF_INVALID',
      'INTERNAL_ERROR',
      'INTEGRATION_UNAVAILABLE',
      'INVALID_AUTHORITY',
      'NOT_FOUND',
      'PROCESSING_CLASS_VIOLATION',
      'PROHIBITED_ACTION',
      'RATE_LIMITED',
      'SESSION_INVALID',
      'VALIDATION_FAILED',
    ]),
  })
  .strict();

export const generatedSchemaPlaceholdersV1 = {
  authenticationErrorResponse: authenticationErrorResponseV1Schema,
  authenticationResponse: authenticationResponseV1Schema,
  authorityTier: authorityTierV1Schema,
  changePasswordRequest: changePasswordRequestV1Schema,
  csrfResponse: csrfResponseV1Schema,
  domainEventEnvelope: domainEventEnvelopeV1Schema,
  loginRequest: loginRequestV1Schema,
  microsoftConnectionStatusResponse: microsoftConnectionStatusResponseV1Schema,
  processingClass: processingClassV1Schema,
  recoveryLoginRequest: recoveryLoginRequestV1Schema,
  revokeSessionsRequest: revokeSessionsRequestV1Schema,
  sessionResponse: sessionResponseV1Schema,
  userScope: userScopeV1Schema,
  workerHealthResponse: workerHealthResponseV1Schema,
} as const;

export const apiContractSchemaVersion = 1 as const;
export * from './triage.js';
export * from './today.js';
