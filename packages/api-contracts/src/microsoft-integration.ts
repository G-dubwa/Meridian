import {
  integrationAccountStatusV1Schema,
  microsoftDelegatedScopesV1Schema,
  microsoftGraphPermissionsV1Schema,
  microsoftRequestedScopesV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import { z } from 'zod';

export const microsoftConnectResponseV1Schema = z
  .object({ authorizationUrl: z.url() })
  .strict();

export const microsoftDisconnectRequestV1Schema = z
  .object({ confirmation: z.literal('DISCONNECT') })
  .strict();

export const microsoftConsentRecordV1Schema = z
  .object({
    action: z.enum(['granted', 'disconnected', 'reauthorization_required']),
    occurredAt: z.iso.datetime({ offset: true }),
    graphPermissions: microsoftGraphPermissionsV1Schema,
    requestedScopes: microsoftRequestedScopesV1Schema,
  })
  .strict();

export const microsoftConnectionAccountV1Schema = z
  .object({
    connectedAt: z.iso.datetime({ offset: true }),
    disconnectedAt: z.iso.datetime({ offset: true }).nullable(),
    displayName: z.string().min(1).max(255),
    graphPermissions: microsoftGraphPermissionsV1Schema,
    id: uuidV1Schema,
    lastRefreshedAt: z.iso.datetime({ offset: true }).nullable(),
    requestedScopes: microsoftRequestedScopesV1Schema,
    status: integrationAccountStatusV1Schema,
  })
  .strict();

export const microsoftConnectionStatusResponseV1Schema = z
  .object({
    account: microsoftConnectionAccountV1Schema.nullable(),
    configured: z.boolean(),
    consentRecords: z.array(microsoftConsentRecordV1Schema),
    requestedScopes: microsoftDelegatedScopesV1Schema,
  })
  .strict();

export type MicrosoftConnectionStatusResponseV1 = z.infer<
  typeof microsoftConnectionStatusResponseV1Schema
>;

export async function getMicrosoftConnectionStatusV1(
  fetcher: typeof fetch = fetch,
): Promise<MicrosoftConnectionStatusResponseV1> {
  const response = await fetcher('/api/integrations/microsoft', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Microsoft connection status failed.');
  return microsoftConnectionStatusResponseV1Schema.parse(await response.json());
}
