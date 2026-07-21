import { z } from 'zod';
import { uuidV1Schema } from './ids.js';

export const MICROSOFT_STAGE_A_REQUESTED_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Calendars.Read',
] as const;

export const MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES = [
  ...MICROSOFT_STAGE_A_REQUESTED_SCOPES,
  'Tasks.ReadWrite',
] as const;

export const MICROSOFT_STAGE_A_GRAPH_PERMISSIONS = [
  'User.Read',
  'Calendars.Read',
] as const;

export const MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS = [
  ...MICROSOFT_STAGE_A_GRAPH_PERMISSIONS,
  'Tasks.ReadWrite',
] as const;

/** @deprecated Prefer the explicit requested-scope name. */
export const MICROSOFT_STAGE_A_SCOPES = MICROSOFT_STAGE_A_REQUESTED_SCOPES;

export const microsoftRequestedScopeV1Schema = z.enum(
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
);
export type MicrosoftRequestedScope = z.infer<
  typeof microsoftRequestedScopeV1Schema
>;

/** @deprecated Prefer MicrosoftRequestedScope. */
export type MicrosoftDelegatedScope = MicrosoftRequestedScope;

export const microsoftGraphPermissionV1Schema = z.enum(
  MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS,
);
export type MicrosoftGraphPermission = z.infer<
  typeof microsoftGraphPermissionV1Schema
>;

function isExactSet(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  const unique = new Set(values);
  return (
    values.length === expected.length &&
    unique.size === expected.length &&
    expected.every((value) => unique.has(value))
  );
}

export const microsoftDelegatedScopesV1Schema = z
  .array(microsoftRequestedScopeV1Schema)
  .superRefine((scopes, context) => {
    if (!isExactSet(scopes, MICROSOFT_STAGE_A_REQUESTED_SCOPES))
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft Stage-A scope set must match exactly.',
      });
  });

export const microsoftRequestedScopesV1Schema = z
  .array(microsoftRequestedScopeV1Schema)
  .superRefine((scopes, context) => {
    if (
      !isExactSet(scopes, MICROSOFT_STAGE_A_REQUESTED_SCOPES) &&
      !isExactSet(scopes, MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES)
    )
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft requested-scope envelope is not approved.',
      });
  });

export const microsoftTodoRequestedScopesV1Schema = z
  .array(microsoftRequestedScopeV1Schema)
  .superRefine((scopes, context) => {
    if (!isExactSet(scopes, MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES))
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft To Do spike scope set must match exactly.',
      });
  });

export const microsoftGraphPermissionsV1Schema = z
  .array(microsoftGraphPermissionV1Schema)
  .superRefine((permissions, context) => {
    if (
      !isExactSet(permissions, MICROSOFT_STAGE_A_GRAPH_PERMISSIONS) &&
      !isExactSet(permissions, MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS)
    )
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft Graph token permission set is not approved.',
      });
  });

export const microsoftTodoGraphPermissionsV1Schema = z
  .array(microsoftGraphPermissionV1Schema)
  .superRefine((permissions, context) => {
    if (!isExactSet(permissions, MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS))
      context.addIssue({
        code: 'custom',
        message: 'The Microsoft To Do Graph permission set must match exactly.',
      });
  });

export function expectedMicrosoftGraphPermissionsV1(
  requestedScopes: readonly MicrosoftRequestedScope[],
): readonly MicrosoftGraphPermission[] {
  const requested = microsoftRequestedScopesV1Schema.parse([
    ...requestedScopes,
  ]);
  return requested.includes('Tasks.ReadWrite')
    ? [...MICROSOFT_TODO_SPIKE_GRAPH_PERMISSIONS]
    : [...MICROSOFT_STAGE_A_GRAPH_PERMISSIONS];
}

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
    requestedScopes: microsoftRequestedScopesV1Schema,
    graphPermissions: microsoftGraphPermissionsV1Schema,
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

export type MicrosoftOAuthFailureStage =
  | 'token_exchange'
  | 'token_validation'
  | 'profile_request'
  | 'profile_validation';

export class MicrosoftOAuthGatewayError extends Error {
  public constructor(
    public readonly reason: MicrosoftOAuthFailureReason,
    public readonly stage?: MicrosoftOAuthFailureStage,
  ) {
    super(reason);
    this.name = 'MicrosoftOAuthGatewayError';
  }
}
