import { z } from 'zod';

export const authIdentifierV1Schema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
export type AuthIdentifier = z.infer<typeof authIdentifierV1Schema>;

export const authPassphraseV1Schema = z.string().min(16).max(1024);
export type AuthPassphrase = z.infer<typeof authPassphraseV1Schema>;

export const recoveryCodeV1Schema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MRD-[A-Z2-9]{8}-[A-Z2-9]{8}$/);
export type RecoveryCode = z.infer<typeof recoveryCodeV1Schema>;

export const authEventTypeV1Schema = z.enum([
  'owner_bootstrapped',
  'login_succeeded',
  'login_failed',
  'logout',
  'session_renewed',
  'password_changed',
  'recovery_code_used',
  'sessions_revoked',
]);
export type AuthEventType = z.infer<typeof authEventTypeV1Schema>;

export const authEventOutcomeV1Schema = z.enum(['succeeded', 'rejected']);
export type AuthEventOutcome = z.infer<typeof authEventOutcomeV1Schema>;

export const authFailureReasonV1Schema = z.enum([
  'credentials_invalid',
  'credential_locked',
  'rate_limited',
  'session_invalid',
  'csrf_invalid',
  'recovery_code_invalid',
]);
export type AuthFailureReason = z.infer<typeof authFailureReasonV1Schema>;
