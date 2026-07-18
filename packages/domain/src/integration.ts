import { z } from 'zod';
import { uuidV1Schema } from './ids.js';

export const MICROSOFT_STAGE_A_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Calendars.Read',
] as const;

export const microsoftDelegatedScopeV1Schema = z.enum(MICROSOFT_STAGE_A_SCOPES);
export type MicrosoftDelegatedScope = z.infer<
  typeof microsoftDelegatedScopeV1Schema
>;

export const microsoftDelegatedScopesV1Schema = z
  .array(microsoftDelegatedScopeV1Schema)
  .length(MICROSOFT_STAGE_A_SCOPES.length)
  .superRefine((scopes, context) => {
    const unique = new Set(scopes);
    if (
      unique.size !== MICROSOFT_STAGE_A_SCOPES.length ||
      MICROSOFT_STAGE_A_SCOPES.some((scope) => !unique.has(scope))
    )
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft Stage-A scope set must match exactly.',
      });
  });

export const integrationAccountStatusV1Schema = z.enum([
  'connected',
  'disconnected',
  'reauthorization_required',
]);
export type IntegrationAccountStatus = z.infer<
  typeof integrationAccountStatusV1Schema
>;

export const consentActionV1Schema = z.enum([
  'granted',
  'disconnected',
  'reauthorization_required',
]);
export type ConsentAction = z.infer<typeof consentActionV1Schema>;

export const microsoftAuthorizationStateV1Schema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export const microsoftAuthorizationCodeV1Schema = z.string().min(1).max(8192);

export const microsoftPkceVerifierV1Schema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const microsoftPkceChallengeV1Schema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/);

export const microsoftProfileV1Schema = z
  .object({
    providerSubjectId: z.string().min(1).max(255),
    displayName: z.string().min(1).max(255),
  })
  .strict();
export type MicrosoftProfile = z.infer<typeof microsoftProfileV1Schema>;

export const microsoftConnectionEventPayloadV1Schema = z
  .object({
    integrationAccountId: uuidV1Schema,
    scopes: microsoftDelegatedScopesV1Schema,
  })
  .strict();

export const microsoftDisconnectionEventPayloadV1Schema = z
  .object({ integrationAccountId: uuidV1Schema })
  .strict();

export type MicrosoftIntegrationEventType =
  | 'integration.microsoft_connected.v1'
  | 'integration.microsoft_disconnected.v1'
  | 'integration.microsoft_reauthorization_required.v1';

export type MicrosoftOAuthFailureReason =
  'authorization_failed' | 'consent_revoked' | 'provider_unavailable';

export class MicrosoftOAuthGatewayError extends Error {
  public constructor(public readonly reason: MicrosoftOAuthFailureReason) {
    super(reason);
    this.name = 'MicrosoftOAuthGatewayError';
  }
}
